import assert from 'node:assert/strict';
import test from 'node:test';

import { projectBrainstemImu } from '../src/services/brainstemImu.ts';

test('an IMU event keeps gyroscope and quaternion and omits acceleration the server did not send', () => {
  const sample = projectBrainstemImu({
    sessionId: 's1', gyroX: 0.25, gyroY: -0.5, gyroZ: 1, quatW: 0.707, quatX: 0, quatY: 0.707, quatZ: 0, timestampMs: 12,
  });
  assert.deepEqual(sample, {
    gyroscope: { x: 0.25, y: -0.5, z: 1 },
    quaternion: { w: 0.707, x: 0, y: 0.707, z: 0 },
    linearAcceleration: null,
    timestampMs: 12,
    source: 'device',
  });
});

test('linear acceleration is kept only when all three components arrive', () => {
  const sample = projectBrainstemImu({
    gyroX: 0, gyroY: 0, gyroZ: 0, quatW: 1, quatX: 0, quatY: 0, quatZ: 0, accelX: 0.1, accelY: -0.2, accelZ: 9.8,
  });
  assert.deepEqual(sample.linearAcceleration, { x: 0.1, y: -0.2, z: 9.8 });
  assert.equal(projectBrainstemImu({
    gyroX: 0, gyroY: 0, gyroZ: 0, quatW: 1, quatX: 0, quatY: 0, quatZ: 0, accelX: 1, accelZ: 2,
  }), null);
  assert.equal(projectBrainstemImu({ gyroX: 0, gyroY: 0, gyroZ: 0 }), null);
  assert.equal(projectBrainstemImu({ gyroX: Number.NaN, gyroY: 0, gyroZ: 0, quatW: 1, quatX: 0, quatY: 0, quatZ: 0 }), null);
  assert.equal(projectBrainstemImu(null), null);
});
