import type { ControlImuReading, ControlQuaternion, ControlVector3 } from '../features/control/controlOperations';

const VECTOR_LIMIT = 1000;
const QUATERNION_LIMIT = 2;

function finite(value: unknown, limit: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

function vector(x: unknown, y: unknown, z: unknown): ControlVector3 | null {
  const vx = finite(x, VECTOR_LIMIT);
  const vy = finite(y, VECTOR_LIMIT);
  const vz = finite(z, VECTOR_LIMIT);
  if (vx === null || vy === null || vz === null) return null;
  return { x: vx, y: vy, z: vz };
}

function quaternion(w: unknown, x: unknown, y: unknown, z: unknown): ControlQuaternion | null {
  const vw = finite(w, QUATERNION_LIMIT);
  const vx = finite(x, QUATERNION_LIMIT);
  const vy = finite(y, QUATERNION_LIMIT);
  const vz = finite(z, QUATERNION_LIMIT);
  if (vw === null || vx === null || vy === null || vz === null) return null;
  return { w: vw, x: vx, y: vy, z: vz };
}

function hasAcceleration(raw: Record<string, unknown>) {
  return 'accelX' in raw || 'accelY' in raw || 'accelZ' in raw;
}

/** Project one ListenImu event. Missing linear acceleration stays null. */
export function projectBrainstemImu(raw: unknown): ControlImuReading | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const gyroscope = vector(value.gyroX, value.gyroY, value.gyroZ);
  const attitude = quaternion(value.quatW, value.quatX, value.quatY, value.quatZ);
  if (!gyroscope || !attitude) return null;
  let linearAcceleration: ControlVector3 | null = null;
  if (hasAcceleration(value)) {
    linearAcceleration = vector(value.accelX, value.accelY, value.accelZ);
    if (!linearAcceleration) return null;
  }
  const timestamp = value.timestampMs;
  const timestampMs = typeof timestamp === 'number' && Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : null;
  return { gyroscope, quaternion: attitude, linearAcceleration, timestampMs, source: 'device' };
}
