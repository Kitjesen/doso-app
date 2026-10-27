import assert from 'node:assert/strict';
import test from 'node:test';

import {
  didTouchEnd,
  NEUTRAL_JOYSTICK_VECTOR,
  projectJoystickInput,
  selectTouchByIdentifier,
} from '../src/features/robot-lifecycle/joystickInput.ts';

test('projects input radially, clamps magnitude, and applies the deadzone', () => {
  assert.deepEqual(projectJoystickInput(0, 0, 50, 'xy'), NEUTRAL_JOYSTICK_VECTOR);
  assert.deepEqual(projectJoystickInput(5, 0, 50, 'xy'), NEUTRAL_JOYSTICK_VECTOR);
  assert.deepEqual(projectJoystickInput(100, 0, 50, 'xy'), { x: 1, y: 0 });

  const diagonal = projectJoystickInput(50, 50, 50, 'xy');
  assert.ok(diagonal.x > 0.7 && diagonal.x <= 0.708);
  assert.equal(diagonal.x, diagonal.y);
  assert.ok(Math.hypot(diagonal.x, diagonal.y) <= 1.001);
});

test('x-only input removes y and remains finite for malformed coordinates', () => {
  assert.deepEqual(projectJoystickInput(25, 999, 50, 'x'), { x: 0.444, y: 0 });
  assert.deepEqual(projectJoystickInput(Number.NaN, Number.POSITIVE_INFINITY, 0, 'xy'), { x: 0, y: 0 });
  assert.deepEqual(projectJoystickInput(20, 20, Number.NaN, 'xy'), {
    x: 0.707,
    y: 0.707,
  });
});

test('touch selection is stable when native touch array order changes', () => {
  const owner = { identifier: 7, pageX: 120, pageY: 80 };
  const other = { identifier: 2, pageX: 20, pageY: 30 };
  assert.equal(selectTouchByIdentifier([other, owner], 7), owner);
  assert.equal(selectTouchByIdentifier([owner, other], 7), owner);
  assert.equal(selectTouchByIdentifier([owner], 2), undefined);
});

test('only the initiating touch can release its joystick', () => {
  const owner = { identifier: 7, pageX: 120, pageY: 80 };
  const other = { identifier: 2, pageX: 20, pageY: 30 };
  assert.equal(didTouchEnd([other], [owner], 7), false);
  assert.equal(didTouchEnd([owner], [other], 7), true);
  assert.equal(didTouchEnd([], [], 7), true);
  assert.equal(didTouchEnd([owner], [], null), false);
});
