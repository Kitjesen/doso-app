import assert from 'node:assert/strict';
import test from 'node:test';
import { getAdaptivePageLayout } from '../src/layout/adaptiveLayout.ts';

test('compact home and task workbenches fit the controller content area without changing map or analysis', () => {
  for (const variant of ['home', 'tasks']) {
    for (const [containerWidth, windowHeight] of [[766, 390], [675, 359], [627, 335], [611, 300]]) {
      const layout = getAdaptivePageLayout({ containerWidth, windowHeight, isLandscape: true, fontScale: 1, variant });
      assert.equal(layout.useColumns, true);
      assert.equal(layout.isCompactColumns, true);
      assert.ok(layout.primaryWidth >= (variant === 'tasks' ? 320 : 280));
      assert.ok(layout.secondaryWidth >= 252);
      assert.equal(layout.primaryWidth + layout.secondaryWidth + layout.gap + 2 * layout.padding, containerWidth);
    }
  }
  for (const variant of ['map', 'analysis']) {
    assert.equal(getAdaptivePageLayout({ containerWidth: 675, windowHeight: 359, isLandscape: true, fontScale: 1, variant }).useColumns, false);
  }
});

test('a wide measured content container supports a readable home workbench', () => {
  const layout = getAdaptivePageLayout({ containerWidth: 882, windowHeight: 600, isLandscape: true, fontScale: 1, variant: 'home' });
  assert.equal(layout.useColumns, true);
  assert.ok(layout.primaryWidth >= 420);
  assert.ok(layout.secondaryWidth >= 320);
  assert.equal(layout.primaryWidth + layout.secondaryWidth + layout.gap, layout.contentWidth);
  assert.equal(layout.contentWidth + 2 * layout.padding, 882);
});

test('map and analysis retain their previous wide geometry and short-height single-column behavior', () => {
  for (const [variant, primary, secondary] of [['map', 320, 490], ['analysis', 449, 361]]) {
    const wide = getAdaptivePageLayout({ containerWidth: 882, windowHeight: 600, isLandscape: true, fontScale: 1, variant });
    assert.equal(wide.primaryWidth, primary); assert.equal(wide.secondaryWidth, secondary);
    assert.equal(wide.padding, 24); assert.equal(wide.gap, 24);
    for (const [containerWidth, windowHeight] of [[675, 342], [753, 390]]) {
      const short = getAdaptivePageLayout({ containerWidth, windowHeight, isLandscape: true, fontScale: 1, variant });
      assert.equal(short.useColumns, false); assert.equal(short.isCompactColumns, false);
      assert.equal(short.primaryWidth, containerWidth - 32);
      assert.equal(short.secondaryWidth, short.primaryWidth);
    }
  }
});

test('unavailable or corrupt layout measurements never produce invalid geometry', () => {
  for (const containerWidth of [NaN, Infinity, -1, 0]) {
    const layout = getAdaptivePageLayout({ containerWidth, windowHeight: 600, isLandscape: true, fontScale: 1, variant: 'home' });
    assert.equal(layout.useColumns, false);
    for (const key of ['contentWidth', 'primaryWidth', 'secondaryWidth', 'padding', 'gap']) {
      assert.ok(Number.isFinite(layout[key]) && layout[key] >= 0, key);
    }
  }
});

test('tasks reserve a readable list and use the remainder for the selected flow', () => {
  for (const containerWidth of [832, 882, 1202]) {
    const layout = getAdaptivePageLayout({ containerWidth, windowHeight: 600, isLandscape: true, fontScale: 1, variant: 'tasks' });
    assert.equal(layout.useColumns, true);
    assert.ok(layout.primaryWidth >= 320 && layout.primaryWidth <= 360);
    assert.ok(layout.secondaryWidth >= 440);
    assert.equal(layout.primaryWidth + layout.gap + layout.secondaryWidth, layout.contentWidth);
  }
});

test('phone, unsupported small containers and large text stay single-column', () => {
  for (const variant of ['home', 'tasks', 'map', 'analysis', 'profile']) {
    for (const input of [
      { containerWidth: 320, windowHeight: 844, isLandscape: false, fontScale: 1 },
      { containerWidth: 390, windowHeight: 844, isLandscape: false, fontScale: 1 },
      { containerWidth: 607, windowHeight: 359, isLandscape: true, fontScale: 1 },
      { containerWidth: 675, windowHeight: 239, isLandscape: true, fontScale: 1 },
      { containerWidth: 675, windowHeight: 359, isLandscape: true, fontScale: 1.21 },
      { containerWidth: 675, windowHeight: 359, isLandscape: true, fontScale: 1.5 },
      { containerWidth: 700, windowHeight: 600, isLandscape: true, fontScale: 1 },
      { containerWidth: 882, windowHeight: 600, isLandscape: true, fontScale: 1.5 },
      { containerWidth: 882, windowHeight: NaN, isLandscape: true, fontScale: 1 },
      { containerWidth: 882, windowHeight: 600, isLandscape: true, fontScale: NaN },
    ]) {
      const layout = getAdaptivePageLayout({ ...input, variant });
      assert.equal(layout.useColumns, false, JSON.stringify(input));
      assert.equal(layout.primaryWidth, layout.contentWidth);
      assert.equal(layout.secondaryWidth, layout.contentWidth);
    }
  }
});
