/**
 * Zero-re-render local-only bus connecting offline joystick / G20 controller sticks
 * directly to the mounted 3D standby scene without triggering React state updates
 * in ControlScreen at 60Hz. Never dispatches any command to the real robot.
 */
export type StandbyDriveSample = Readonly<{
  driveX: number;
  driveY: number;
  turnX: number;
}>;

type Listener = (sample: StandbyDriveSample) => void;

const ZERO_SAMPLE: StandbyDriveSample = Object.freeze({ driveX: 0, driveY: 0, turnX: 0 });
const listeners = new Set<Listener>();
let latestSample: StandbyDriveSample = ZERO_SAMPLE;

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function publishStandbyDriveInput(driveX: number, driveY: number, turnX: number): void {
  const nx = clampUnit(driveX);
  const ny = clampUnit(driveY);
  const nt = clampUnit(turnX);
  if (
    Math.abs(nx - latestSample.driveX) < 0.001
    && Math.abs(ny - latestSample.driveY) < 0.001
    && Math.abs(nt - latestSample.turnX) < 0.001
  ) {
    return;
  }
  latestSample = nx === 0 && ny === 0 && nt === 0
    ? ZERO_SAMPLE
    : { driveX: nx, driveY: ny, turnX: nt };
  for (const listener of listeners) {
    listener(latestSample);
  }
}

export function resetStandbyDriveInput(): void {
  publishStandbyDriveInput(0, 0, 0);
}

export function getStandbyDriveInput(): StandbyDriveSample {
  return latestSample;
}

export function subscribeStandbyDriveInput(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
