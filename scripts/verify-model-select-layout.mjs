import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MODEL_SELECT_HEADER_SIDE_WIDTH,
  MODEL_SELECT_LARGE_TEXT_CARD_HEIGHT,
  MODEL_SELECT_LANDSCAPE_BASE_GAP,
  MODEL_SELECT_LANDSCAPE_BASE_LEFT_WIDTH,
  MODEL_SELECT_LANDSCAPE_BASE_RIGHT_WIDTH,
  MODEL_SELECT_LANDSCAPE_CARD_GAP,
  MODEL_SELECT_LANDSCAPE_CONTROL_MAX_WIDTH,
  MODEL_SELECT_LANDSCAPE_MIN_CARD_WIDTH,
  MODEL_SELECT_LANDSCAPE_MIN_LEFT_WIDTH,
  MODEL_SELECT_LANDSCAPE_MIN_RIGHT_WIDTH,
  MODEL_SELECT_PORTRAIT_BASE_CARD_WIDTH,
  findVisibleSelectedModel,
  getModelSelectLayoutMetrics,
} from '../src/screens/modelSelectLayout.ts';

function safeAreaContentWidth(viewportWidth, leftInset, rightInset) {
  return viewportWidth - leftInset - rightInset;
}

function occupiedWidth(metrics) {
  if (typeof metrics.leftColumnWidth !== 'number' || typeof metrics.rightColumnWidth !== 'number') {
    throw new TypeError('column metrics must be numeric');
  }
  return metrics.leftColumnWidth + metrics.rightColumnWidth + metrics.gridGap;
}

function assertHeaderFits(contentWidth, progressWidth) {
  assert.ok(progressWidth >= 0);
  assert.ok(progressWidth + MODEL_SELECT_HEADER_SIDE_WIDTH * 2 <= contentWidth);
}

function relativeLuminance(hex) {
  const channels = hex.match(/[0-9a-f]{2}/gi);
  assert.ok(channels);
  const [red, green, blue] = channels.map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

test('844px Figma viewport keeps the exact 376/20/408 two-panel grid with two readable cards per row', () => {
  const metrics = getModelSelectLayoutMetrics({
    containerWidth: safeAreaContentWidth(844, 0, 0),
    isLandscape: true,
  });
  assert.equal(metrics.usesColumns, true);
  assert.equal(metrics.leftColumnWidth, MODEL_SELECT_LANDSCAPE_BASE_LEFT_WIDTH);
  assert.equal(metrics.gridGap, MODEL_SELECT_LANDSCAPE_BASE_GAP);
  assert.equal(metrics.rightColumnWidth, MODEL_SELECT_LANDSCAPE_BASE_RIGHT_WIDTH);
  assert.equal(metrics.cardGap, MODEL_SELECT_LANDSCAPE_CARD_GAP);
  assert.equal(metrics.cardsPerRow, 2);
  assert.equal(metrics.controlWidth, MODEL_SELECT_LANDSCAPE_CONTROL_MAX_WIDTH);
  assertHeaderFits(metrics.headerContentWidth, metrics.headerProgressWidth);
  assert.equal(occupiedWidth(metrics), 804);
  assert.ok(occupiedWidth(metrics) <= 844 - 40);
});

test('left and right cutouts produce identical non-overflowing columns and controls', () => {
  const leftCutout = getModelSelectLayoutMetrics({
    containerWidth: safeAreaContentWidth(844, 44, 0),
    isLandscape: true,
  });
  const rightCutout = getModelSelectLayoutMetrics({
    containerWidth: safeAreaContentWidth(844, 0, 44),
    isLandscape: true,
  });
  assert.deepEqual(leftCutout, rightCutout);
  assert.equal(leftCutout.usesColumns, true);
  assert.ok(occupiedWidth(leftCutout) <= leftCutout.availableContentWidth);
  assert.equal(typeof leftCutout.leftColumnWidth, 'number');
  assert.equal(typeof leftCutout.controlWidth, 'number');
  assert.ok(leftCutout.controlWidth <= leftCutout.leftColumnWidth);
  assertHeaderFits(leftCutout.headerContentWidth, leftCutout.headerProgressWidth);
});

test('two side cutouts shrink the grid without clipping either column or left control', () => {
  const metrics = getModelSelectLayoutMetrics({
    containerWidth: safeAreaContentWidth(844, 44, 44),
    isLandscape: true,
  });
  assert.equal(metrics.usesColumns, true);
  assert.ok(occupiedWidth(metrics) <= metrics.availableContentWidth);
  assert.ok(metrics.leftColumnWidth >= MODEL_SELECT_LANDSCAPE_MIN_LEFT_WIDTH);
  assert.ok(metrics.rightColumnWidth >= MODEL_SELECT_LANDSCAPE_MIN_RIGHT_WIDTH);
  assert.ok(metrics.cardWidth >= MODEL_SELECT_LANDSCAPE_MIN_CARD_WIDTH);
  assert.ok(metrics.cardWidth * 2 + MODEL_SELECT_LANDSCAPE_CARD_GAP <= metrics.rightColumnWidth);
  assert.equal(typeof metrics.controlWidth, 'number');
  assert.ok(metrics.controlWidth <= metrics.leftColumnWidth);
  assertHeaderFits(metrics.headerContentWidth, metrics.headerProgressWidth);
});

test('844px App shell keeps two landscape cards readable after the 78px navigation reserve', () => {
  const metrics = getModelSelectLayoutMetrics({ containerWidth: 844 - 78, isLandscape: true });
  assert.equal(metrics.usesColumns, true);
  assert.ok(metrics.cardWidth >= MODEL_SELECT_LANDSCAPE_MIN_CARD_WIDTH);
  assert.equal(metrics.cardsPerRow, 2);
  assert.ok(metrics.cardWidth * 2 + MODEL_SELECT_LANDSCAPE_CARD_GAP <= metrics.rightColumnWidth);
  assert.ok(occupiedWidth(metrics) <= metrics.availableContentWidth);
  assertHeaderFits(metrics.headerContentWidth, metrics.headerProgressWidth);
});

test('narrow landscape falls back to a stacked layout before columns become unreadable', () => {
  const metrics = getModelSelectLayoutMetrics({ containerWidth: 650, isLandscape: true });
  assert.equal(metrics.usesColumns, false);
  assert.equal(metrics.leftColumnWidth, '100%');
  assert.equal(metrics.rightColumnWidth, '100%');
  assert.equal(metrics.availableContentWidth, 650 - 44);
});

for (const viewportWidth of [360, 320]) {
  test(`${viewportWidth}px narrow landscape uses the rendered 22px stacked padding`, () => {
    const metrics = getModelSelectLayoutMetrics({ containerWidth: viewportWidth, isLandscape: true });
    assert.equal(metrics.usesColumns, false);
    assert.equal(metrics.availableContentWidth, viewportWidth - 44);
    assert.ok(metrics.cardWidth * 2 + metrics.cardGap <= metrics.availableContentWidth);
    assertHeaderFits(metrics.headerContentWidth, metrics.headerProgressWidth);
  });
}

for (const [viewportWidth, expectedCardWidth] of [
  [390, MODEL_SELECT_PORTRAIT_BASE_CARD_WIDTH],
  [360, 152],
  [320, 132],
]) {
  test(`${viewportWidth}px portrait keeps cards, header and controls inside the measured width`, () => {
    const metrics = getModelSelectLayoutMetrics({ containerWidth: viewportWidth, isLandscape: false });
    assert.equal(metrics.usesColumns, false);
    assert.equal(metrics.cardWidth, expectedCardWidth);
    assert.equal(metrics.cardGap, 12);
    assert.ok(metrics.cardWidth * 2 + metrics.cardGap <= metrics.availableContentWidth);
    assert.equal(metrics.controlWidth, '100%');
    assertHeaderFits(metrics.headerContentWidth, metrics.headerProgressWidth);
  });
}

test('non-positive measurements remain safe until the first layout event', () => {
  const metrics = getModelSelectLayoutMetrics({ containerWidth: 0, isLandscape: false });
  assert.equal(metrics.cardWidth, 0);
  assert.equal(metrics.availableContentWidth, 0);
  assert.equal(metrics.headerProgressWidth, 0);
});

for (const viewport of [
  { width: 390, landscape: false, expectedWidth: 346 },
  { width: 844, landscape: true, expectedWidth: 360 },
  { width: 320, landscape: false, expectedWidth: 276 },
]) {
  test(`${viewport.width}px large-text viewport uses one flexible card column`, () => {
    const metrics = getModelSelectLayoutMetrics({
      containerWidth: viewport.width,
      isLandscape: viewport.landscape,
      largeText: true,
    });
    assert.equal(metrics.usesColumns, false);
    assert.equal(metrics.largeText, true);
    assert.equal(metrics.cardsPerRow, 1);
    assert.equal(metrics.cardWidth, viewport.expectedWidth);
    assert.equal(metrics.cardHeight, MODEL_SELECT_LARGE_TEXT_CARD_HEIGHT);
    assert.ok(metrics.cardWidth <= metrics.availableContentWidth);
  });
}

test('continue selection fails closed when the selected model is filtered out or no result remains', () => {
  const visibleModels = [{ id: 'thunder-mini' }];
  assert.deepEqual(findVisibleSelectedModel(visibleModels, 'thunder-mini'), visibleModels[0]);
  assert.equal(findVisibleSelectedModel(visibleModels, 'thunder-pro'), null);
  assert.equal(findVisibleSelectedModel([], 'thunder-mini'), null);
});

test('every accepted small-text foreground meets WCAG AA on its screen, field and card surface', () => {
  assert.ok(contrastRatio('#373737', '#FFFFFF') >= 4.5);
  assert.ok(contrastRatio('#373737', '#F5F7FB') >= 4.5);
  assert.ok(contrastRatio('#373737', '#EDF4FF') >= 4.5);
  assert.ok(contrastRatio('#D8DEE7', '#0E1116') >= 4.5);
  assert.ok(contrastRatio('#D8DEE7', '#25303A') >= 4.5);
  assert.ok(contrastRatio('#D8DEE7', '#1A2028') >= 4.5);
  assert.ok(contrastRatio('#D8DEE7', '#15243A') >= 4.5);
  assert.ok(contrastRatio('#FFFFFF', '#0066FF') >= 4.5);
  assert.ok(contrastRatio('#17191D', '#88BBFF') >= 4.5);
});
