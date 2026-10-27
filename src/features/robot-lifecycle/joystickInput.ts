export type JoystickAxis = 'xy' | 'x';

export type JoystickVector = Readonly<{
  x: number;
  y: number;
}>;

export type JoystickTouch = Readonly<{
  identifier: number;
  pageX: number;
  pageY: number;
}>;

export const NEUTRAL_JOYSTICK_VECTOR: JoystickVector = Object.freeze({ x: 0, y: 0 });

function finiteOrZero(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function roundControlValue(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function projectJoystickInput(
  deltaX: number,
  deltaY: number,
  radius: number,
  axis: JoystickAxis,
  deadzone = 0.1,
): JoystickVector {
  const safeRadius = Math.max(1, Math.abs(finiteOrZero(radius)));
  const safeDeadzone = Math.min(0.95, Math.max(0, finiteOrZero(deadzone)));
  const normalizedX = finiteOrZero(deltaX) / safeRadius;
  const normalizedY = axis === 'x' ? 0 : finiteOrZero(deltaY) / safeRadius;
  const magnitude = Math.hypot(normalizedX, normalizedY);

  if (!Number.isFinite(magnitude) || magnitude <= safeDeadzone) {
    return NEUTRAL_JOYSTICK_VECTOR;
  }

  const limitedMagnitude = Math.min(1, magnitude);
  const scaledMagnitude = (limitedMagnitude - safeDeadzone) / (1 - safeDeadzone);
  const directionScale = scaledMagnitude / magnitude;

  return {
    x: roundControlValue(normalizedX * directionScale),
    y: axis === 'x' ? 0 : roundControlValue(normalizedY * directionScale),
  };
}

export function selectTouchByIdentifier(
  touches: readonly JoystickTouch[] | undefined,
  identifier: number | null,
) {
  if (identifier === null || !touches) return undefined;
  return touches.find(touch => touch.identifier === identifier);
}

export function didTouchEnd(
  changedTouches: readonly JoystickTouch[] | undefined,
  remainingTouches: readonly JoystickTouch[] | undefined,
  identifier: number | null,
) {
  if (identifier === null) return false;
  return Boolean(selectTouchByIdentifier(changedTouches, identifier))
    || !selectTouchByIdentifier(remainingTouches, identifier);
}
