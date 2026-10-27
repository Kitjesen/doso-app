import assert from 'node:assert/strict';
import test from 'node:test';
import { getDevicePageLayout } from '../src/screens/devicePageLayout.ts';

// Geometry tests complement, but do not replace, Android pixel measurements.

test('844x390 device pages share a content-independent 333/24/391 grid after a left cutout', () => {
  assert.deepEqual(getDevicePageLayout({ width: 844, height: 390, insetLeft: 48 }), {
    contentWidth: 748, introWidth: 333, detailsWidth: 391, gap: 24, usesColumns: true,
  });
});

test('reversing the cutout preserves widths and two cutouts remain protected', () => {
  const left = getDevicePageLayout({ width: 844, height: 390, insetLeft: 48 });
  const right = getDevicePageLayout({ width: 844, height: 390, insetRight: 48 });
  assert.deepEqual(left, right);
  const both = getDevicePageLayout({ width: 844, height: 390, insetLeft: 48, insetRight: 48 });
  assert.equal(both.contentWidth, 700);
  assert.equal(both.introWidth + both.gap + both.detailsWidth, 700);
});

test('measured safe viewport wins over stale window metrics without subtracting the cutout twice', () => {
  const layout = getDevicePageLayout({ width: 850, height: 393, insetLeft: 48, containerWidth: 796 });
  assert.deepEqual(layout, getDevicePageLayout({ width: 844, height: 390, insetLeft: 48 }));
});

test('portrait preserves the 24px gutter and compact phones the 16px gutter', () => {
  const portrait = getDevicePageLayout({ width: 390, height: 844 });
  assert.equal(portrait.usesColumns, false);
  assert.equal(portrait.contentWidth, 342);
  assert.equal(getDevicePageLayout({ width: 320, height: 568 }).contentWidth, 288);
});

test('narrow safe landscape stacks instead of squeezing columns', () => {
  const layout = getDevicePageLayout({ width: 700, height: 390, insetLeft: 64, insetRight: 64 });
  assert.equal(layout.usesColumns, false);
  assert.equal(layout.introWidth, layout.contentWidth);
  assert.equal(layout.detailsWidth, layout.contentWidth);
});

test('fractional, tablet and invalid measurements never overflow or yield negative widths', () => {
  for (const width of [0, 320, 699, 700, 844.5, 1024, 1366, Number.NaN]) {
    for (const inset of [-8, 0, 48.5, 900]) {
      const layout = getDevicePageLayout({ width, height: 390, insetLeft: inset, insetRight: inset });
      assert.ok(Number.isFinite(layout.contentWidth) && layout.contentWidth >= 0 && layout.contentWidth <= 960);
      if (layout.usesColumns) {
        assert.equal(layout.introWidth + layout.gap + layout.detailsWidth, layout.contentWidth);
        assert.ok(layout.introWidth >= 264 && layout.detailsWidth >= 312);
      }
    }
  }
});
