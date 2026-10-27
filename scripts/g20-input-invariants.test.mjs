import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { beginG20Calibration, G20IntentGate, learnG20Axis, projectG20Input } from '../src/features/control/g20InputModel.ts';

// Synthetic inputs use the pinned SDK's documented channel-range structure.
// These bounded, seeded checks exercise semantic invariants, not device throughput.
const SEED = 0xd0502026;
const modelUrl = new URL('../src/features/control/g20InputModel.ts', import.meta.url);
const digest = url => createHash('sha256').update(readFileSync(url)).digest('hex');
const initialModelSha256 = digest(modelUrl);
const results = [];
const axes = ['leftX', 'leftY', 'rightX', 'rightY'];
const actions = ['stand', 'sit', 'stop', 'enableMotor', 'disableMotor', 'switchPolicy'];

function random(seed) {
  let state = seed >>> 0;
  return max => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) % max; };
}
function sample(channels = Array(16).fill(1500), extra = {}) {
  return {
    requestId: 'seeded-synthetic', generation: 1, sequence: 1,
    receivedAtMonotonicMs: 1000, requestStartedAtMonotonicMs: 995,
    channels, controlMode: 'USA', configurationReady: true,
    channelSettings: Array.from({ length: 16 }, (_, channelIndex) => ({
      channelIndex, index: channelIndex + 1, mapping: channelIndex + 1,
      min: 1050, middle: 1500, max: 1950, reverse: false,
    })),
    ...extra,
  };
}
function calibration(channelsByAxis = [0, 1, 2, 3], polarities = [1, 1, 1, 1]) {
  let value = beginG20Calibration(sample());
  for (const [index, axis] of axes.entries()) {
    const channels = Array(16).fill(1500);
    const instructedDirection = axis.endsWith('Y') ? -1 : 1;
    channels[channelsByAxis[index]] += 450 * instructedDirection * polarities[index];
    value = learnG20Axis(value, axis, sample(channels));
  }
  return value;
}
function frame(vector, pressed = []) {
  return { vector, pressed, neutral: !pressed.length && Object.values(vector).every(value => value === 0) };
}
const centered = () => ({ leftX: 0, leftY: 0, rightX: 0, rightY: 0 });
function invariant(name, cases, run) {
  test(name, () => {
    try { run(); results.push({ name, cases, passed: true }); }
    catch (error) { results.push({ name, cases, passed: false, failure: error.message }); throw error; }
  });
}

invariant('changing only right Y preserves the same commanded turn for every seeded right X', 2048, () => {
  const next = random(SEED ^ 1);
  const value = calibration();
  for (let input = 0; input < 256; input++) {
    const channels = Array(16).fill(1500);
    channels[2] = 1050 + next(901);
    const expected = projectG20Input(value, sample(channels)).vector.rightX;
    for (let variation = 0; variation < 8; variation++) {
      const transformed = [...channels]; transformed[3] = 1050 + next(901);
      assert.equal(projectG20Input(value, sample(transformed)).vector.rightX, expected,
        `seed=${SEED} input=${input} rightX=${channels[2]} rightY=${transformed[3]}`);
    }
  }
});

invariant('learning a channel permutation and reversed polarity preserves the physical intent', 128, () => {
  const next = random(SEED ^ 2);
  const reference = calibration();
  for (let input = 0; input < 128; input++) {
    const permutation = Array.from({ length: 16 }, (_, index) => index);
    for (let index = permutation.length - 1; index > 0; index--) {
      const target = next(index + 1);
      [permutation[index], permutation[target]] = [permutation[target], permutation[index]];
    }
    const channelsByAxis = permutation.slice(0, 4);
    const polarities = axes.map(() => next(2) ? 1 : -1);
    const changed = calibration(channelsByAxis, polarities);
    const originalChannels = Array(16).fill(1500);
    const changedChannels = Array(16).fill(1500);
    for (let axis = 0; axis < 4; axis++) {
      const displacement = next(901) - 450;
      originalChannels[axis] += displacement;
      changedChannels[channelsByAxis[axis]] += displacement * polarities[axis];
    }
    const original = projectG20Input(reference, sample(originalChannels)).vector;
    const transformed = projectG20Input(changed, sample(changedChannels)).vector;
    for (const axis of axes) assert.ok(Math.abs(original[axis] - transformed[axis]) < 1e-12,
      `seed=${SEED} input=${input} axis=${axis} permutation=${channelsByAxis} polarities=${polarities}`);
  }
});

invariant('every ordinary action emitted by a seeded event stream has centered sticks and exactly one key', 2048, () => {
  const next = random(SEED ^ 3);
  const gate = new G20IntentGate();
  gate.setEnabled(true, () => 0);
  let enabled = true, ordinaryActions = 0;
  for (let sequence = 1; sequence <= 2048; sequence++) {
    if (next(25) === 0) { enabled = !enabled; gate.setEnabled(enabled, () => 0); }
    const vector = centered();
    if (next(5) === 0) vector[axes[next(4)]] = (next(2001) - 1000) / 1000 || .5;
    const pressed = next(4) ? [] : [actions[next(actions.length)]];
    if (pressed.length && next(4) === 0) pressed.push(actions[(actions.indexOf(pressed[0]) + 1) % actions.length]);
    const fresh = next(10) !== 0;
    const decision = gate.accept(sample(undefined, { sequence }), frame(vector, pressed), fresh);
    if (decision.action && decision.action !== 'stop') {
      ordinaryActions++;
      assert.equal(enabled && fresh, true, `seed=${SEED} sequence=${sequence}`);
      assert.equal(pressed.length, 1, `seed=${SEED} sequence=${sequence}`);
      assert.ok(Object.values(vector).every(value => value === 0), `seed=${SEED} sequence=${sequence}`);
      assert.equal(decision.action, pressed[0], `seed=${SEED} sequence=${sequence}`);
    }
  }
  assert.ok(ordinaryActions >= 20, `Non-vacuity: only ${ordinaryActions} ordinary actions were exercised`);
});

invariant('revocation expiry reset and new source generation require a new neutral before motion resumes', 384, () => {
  const next = random(SEED ^ 4);
  for (let input = 0; input < 96; input++) {
    for (const boundary of ['permission', 'expired', 'reset', 'generation']) {
      const gate = new G20IntentGate(); gate.setEnabled(true, () => 0);
      let generation = 1, sequence = 0;
      const accept = (value, fresh = true) => gate.accept(sample(undefined, { generation, sequence: ++sequence }), frame(value), fresh);
      const moving = centered(); moving[axes[next(4)]] = next(2) ? .8 : -.8;
      accept(centered()); assert.equal(accept(moving).send, true);
      if (boundary === 'permission') { gate.setEnabled(false); assert.equal(accept(moving).send, false); gate.setEnabled(true, () => 0); }
      else if (boundary === 'expired') assert.equal(accept(moving, false).send, false);
      else if (boundary === 'reset') gate.reset(true);
      else { generation++; sequence = 0; assert.equal(accept(moving).send, false); }
      for (let held = 0; held < 8; held++) assert.equal(accept(moving).send, false,
        `seed=${SEED} input=${input} boundary=${boundary} held=${held}`);
      accept(centered());
      assert.equal(accept(moving).send, true, `seed=${SEED} input=${input} boundary=${boundary}`);
    }
  }
});

invariant('a fresh stop edge remains reachable with nonzero sticks and other held keys', 128, () => {
  const next = random(SEED ^ 5);
  for (let input = 0; input < 128; input++) {
    const gate = new G20IntentGate(); gate.setEnabled(true, () => 0);
    const ordinary = actions.filter(action => action !== 'stop')[next(5)];
    const moving = centered(); moving[axes[next(4)]] = next(2) ? 1 : -1;
    gate.accept(sample(), frame(centered()), true);
    gate.accept(sample(undefined, { sequence: 2 }), frame(centered(), [ordinary]), true);
    const stop = gate.accept(sample(undefined, { sequence: 3 }), frame(moving, [ordinary, 'stop']), true);
    assert.equal(stop.action, 'stop', `seed=${SEED} input=${input}`);
    assert.equal(stop.send, false);
    assert.equal(gate.accept(sample(undefined, { sequence: 4 }), frame(moving, [ordinary, 'stop']), true).action, null);
  }
});

after(() => {
  const finalModelSha256 = digest(modelUrl);
  assert.equal(finalModelSha256, initialModelSha256, 'Product model changed during invariant verification');
  if (process.env.DOSO_G20_INVARIANTS_REPORT === '1') {
    const report = {
      createdAt: new Date().toISOString(), seed: SEED, seedHex: `0x${SEED.toString(16)}`,
      passed: results.length === 5 && results.every(result => result.passed),
      topLevelTests: results.length, boundedCases: results.reduce((total, result) => total + result.cases, 0), results,
      model: { path: 'src/features/control/g20InputModel.ts', sha256: finalModelSha256, inputDrift: false },
      test: { path: 'scripts/g20-input-invariants.test.mjs', sha256: digest(new URL(import.meta.url)) },
      limits: ['Synthetic channel values and event sequences; not captured G20 input',
        'No SDK/JNI execution, APK, device, network, or robot operation',
        'Gate revocation properties do not replace ControlScreen source-ownership integration tests',
        'Bounded seeded properties are evidence for these invariants, not a proof of whole-system safety'],
    };
    writeFileSync(new URL('../artifacts/release-readiness/20261025-input-depth/invariants-result.json', import.meta.url),
      `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  }
});
