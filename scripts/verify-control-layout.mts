// @ts-nocheck -- Node executes this contract with TypeScript type stripping.
import assert from 'node:assert/strict';
import test from 'node:test';
import { getControlLayoutMetrics } from '../src/screens/controlLayout.ts';

function metrics(width: number, height: number) {
  return getControlLayoutMetrics({ containerWidth: width, containerHeight: height, isLandscape: width > height });
}
function assertPairFits(value: ReturnType<typeof metrics>) {
  const occupied = value.joystickSize * 2 + value.joystickGap;
  const padContentWidth = Math.max(0, value.manualPanelWidth - 24);
  assert.ok(occupied <= padContentWidth, occupied + ' exceeds manual panel content width ' + padContentWidth);
  assert.ok(value.joystickSize === 0 || value.joystickSize >= 48);
  assert.ok(value.joystickSize <= 144);
  assert.ok(value.mapPanelWidth <= value.availableContentWidth);
  assert.ok(value.manualPanelWidth <= value.availableContentWidth);
  if (value.useColumns) {
    assert.ok(value.mapPanelWidth + value.manualPanelWidth + value.sectionGap <= value.mainPanelWidth);
    assert.ok(value.operationsPanelWidth + value.mainPanelWidth + value.sectionGap <= value.availableContentWidth);
    assert.equal(value.operationGroupWidth, value.operationsPanelWidth);
  } else {
    assert.equal(value.mapPanelWidth, value.availableContentWidth);
    assert.equal(value.manualPanelWidth, value.availableContentWidth);
    assert.equal(value.operationGroupWidth, value.availableContentWidth);
  }
}
function assertFiniteGeometry(value: ReturnType<typeof metrics>) {
  assert.equal(typeof value.useColumns, 'boolean');
  for (const [key, measurement] of Object.entries(value)) {
    if (key !== 'useColumns') assert.ok(Number.isFinite(measurement), `${key} must be finite`);
  }
}

test('390 portrait stacks map and manual panels with labeled compact circular pads', () => {
  const value = metrics(390, 844);
  assert.equal(value.availableContentWidth, 350);
  assert.equal(value.useColumns, false);
  assert.equal(value.joystickSize, 144);
  assert.equal(value.joystickGap, 24);
  assertPairFits(value);
});

test('large text stacks operation groups and map/manual panels without clipping action labels', () => {
  const value = getControlLayoutMetrics({ containerWidth: 753, containerHeight: 390, isLandscape: true, fontScale: 1.6 });
  assert.equal(value.useColumns, false);
  assertPairFits(value);
  assertFiniteGeometry(value);
});
test('small phones, unmeasured first frame and tablets never overflow', () => {
  for (const width of [0, 200, 280, 320, 360, 390, 430, 1024]) {
    assertPairFits(metrics(width, 1200));
  }
});
test('landscape allocates map and manual columns and leaves room for status and recall', () => {
  const value = metrics(844, 390);
  assert.equal(value.useColumns, true);
  assert.ok(value.mapPanelWidth >= 144);
  assert.ok(value.operationsPanelWidth >= 188);
  assert.equal(value.joystickGap, 20);
  assert.ok(value.joystickSize < metrics(844, 471).joystickSize, 'shorter viewport reserves space for information and actions');
  assertPairFits(value);
});
test('safe-area width is consumed once, never reclaimed through a notch', () => {
  for (const insets of [0, 44, 88]) {
    const value = metrics(844 - insets, 342);
    assert.equal(value.contentWidth, 844 - insets);
    assertPairFits(value);
  }
});
test('landscape safe-area geometry retains room for header, status, labels and recall', () => {
  const value = metrics(756, 342);
  assert.ok(value.joystickSize + 280 <= 342);
  assertPairFits(value);
});

test('invalid measurements fail closed to finite zero geometry', () => {
  for (const invalid of [NaN, Infinity, -Infinity]) {
    for (const value of [metrics(invalid, 390), metrics(753, invalid)]) {
      assertFiniteGeometry(value);
      assert.equal(value.joystickSize, 0);
      assertPairFits(value);
    }
  }
});

test('synthetic G20-sized windows and extreme small containers keep finite bounded geometry', () => {
  // Derived window scenarios only: these are not measured React Native G20 containers.
  for (const [width, height] of [[753, 471], [675, 390], [1, 1], [39, 100], [80, 110], [-1, -1]]) {
    const value = metrics(width, height);
    assertFiniteGeometry(value);
    assert.ok(value.horizontalPadding * 2 <= value.contentWidth);
    assertPairFits(value);
    if (height >= 280) assert.ok(value.joystickSize + 280 <= height);
    else assert.equal(value.joystickSize, 0);
  }
});
