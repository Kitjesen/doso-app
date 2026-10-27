export const DESIGN_ACCEPTANCE_THRESHOLDS = Object.freeze({
  mae: 12,
  delta16Percent: 15,
  delta32Percent: 8,
  ssim: 0.8,
});

export const CRITICAL_REGION_SSIM_THRESHOLD = 0.9;

export function isDynamicSystemBarPixel(x, y, width, height) {
  if (!((width === 390 && height === 844) || (width === 844 && height === 390))) return false;
  const portrait = height > width;
  const top = portrait ? 32 : 24;
  const bottom = portrait ? 24 : 16;
  return y < top || y >= height - bottom;
}

function channelAt(image, x, y, channel, scale) {
  if (scale === 1) return image.pixels[(y * image.width + x) * 4 + channel];
  let total = 0;
  for (let offsetY = 0; offsetY < scale; offsetY += 1) {
    for (let offsetX = 0; offsetX < scale; offsetX += 1) {
      const sourceX = x * scale + offsetX;
      const sourceY = y * scale + offsetY;
      total += image.pixels[(sourceY * image.width + sourceX) * 4 + channel];
    }
  }
  return Math.round(total / (scale * scale));
}

function roundedMetrics(metrics) {
  return Object.fromEntries(Object.entries(metrics).map(([key, value]) => [
    key,
    Number.isInteger(value) ? value : Number(value.toFixed(4)),
  ]));
}

export function calculateDecodedComparisonMetrics(
  reference,
  actual,
  {
    maskDynamicSystemBars = true,
    rect = { x: 0, y: 0, width: actual.width, height: actual.height },
    referenceScale = 1,
    ssimThreshold = DESIGN_ACCEPTANCE_THRESHOLDS.ssim,
  } = {},
) {
  if (!Number.isInteger(referenceScale) || referenceScale < 1) throw new Error('referenceScale must be a positive integer');
  if (!Number.isFinite(ssimThreshold)) throw new Error('ssimThreshold must be finite');
  if (reference.width !== actual.width * referenceScale || reference.height !== actual.height * referenceScale) {
    throw new Error(`Reference/actual dimensions differ after normalization: ${reference.width}x${reference.height} vs ${actual.width}x${actual.height} at ${referenceScale}x`);
  }
  const { x, y, width, height } = rect;
  if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0
    || x + width > actual.width || y + height > actual.height) {
    throw new Error(`Comparison rect is outside ${actual.width}x${actual.height}: ${JSON.stringify(rect)}`);
  }

  let pixelCount = 0;
  let absoluteDelta = 0;
  let delta16 = 0;
  let delta32 = 0;
  const channelStats = Array.from({ length: 3 }, () => ({ actual: 0, reference: 0 }));

  for (let targetY = y; targetY < y + height; targetY += 1) {
    for (let targetX = x; targetX < x + width; targetX += 1) {
      if (maskDynamicSystemBars && isDynamicSystemBarPixel(targetX, targetY, actual.width, actual.height)) continue;
      pixelCount += 1;
      let maxDelta = 0;
      for (let channel = 0; channel < 3; channel += 1) {
        const expected = channelAt(reference, targetX, targetY, channel, referenceScale);
        const observed = channelAt(actual, targetX, targetY, channel, 1);
        const delta = Math.abs(expected - observed);
        absoluteDelta += delta;
        maxDelta = Math.max(maxDelta, delta);
        channelStats[channel].reference += expected;
        channelStats[channel].actual += observed;
      }
      if (maxDelta > 16) delta16 += 1;
      if (maxDelta > 32) delta32 += 1;
    }
  }
  if (pixelCount === 0) throw new Error('Comparison rect contains no evaluated pixels');

  const means = channelStats.map(({ actual: actualTotal, reference: referenceTotal }) => ({
    actual: actualTotal / pixelCount,
    reference: referenceTotal / pixelCount,
  }));
  const moments = Array.from({ length: 3 }, () => ({ actualVariance: 0, covariance: 0, referenceVariance: 0 }));
  for (let targetY = y; targetY < y + height; targetY += 1) {
    for (let targetX = x; targetX < x + width; targetX += 1) {
      if (maskDynamicSystemBars && isDynamicSystemBarPixel(targetX, targetY, actual.width, actual.height)) continue;
      for (let channel = 0; channel < 3; channel += 1) {
        const referenceDelta = channelAt(reference, targetX, targetY, channel, referenceScale) - means[channel].reference;
        const actualDelta = channelAt(actual, targetX, targetY, channel, 1) - means[channel].actual;
        moments[channel].referenceVariance += referenceDelta * referenceDelta;
        moments[channel].actualVariance += actualDelta * actualDelta;
        moments[channel].covariance += referenceDelta * actualDelta;
      }
    }
  }

  const divisor = Math.max(1, pixelCount - 1);
  const c1 = (0.01 * 255) ** 2;
  const c2 = (0.03 * 255) ** 2;
  const ssim = moments.reduce((sum, moment, channel) => {
    const referenceVariance = moment.referenceVariance / divisor;
    const actualVariance = moment.actualVariance / divisor;
    const covariance = moment.covariance / divisor;
    const referenceMean = means[channel].reference;
    const actualMean = means[channel].actual;
    return sum + ((2 * referenceMean * actualMean + c1) * (2 * covariance + c2))
      / ((referenceMean ** 2 + actualMean ** 2 + c1) * (referenceVariance + actualVariance + c2));
  }, 0) / 3;

  const rawMetrics = {
    mae: absoluteDelta / (pixelCount * 3),
    delta16Percent: delta16 * 100 / pixelCount,
    delta32Percent: delta32 * 100 / pixelCount,
    ssim,
  };
  const metrics = roundedMetrics({
    ...rawMetrics,
    evaluatedPixelCount: pixelCount,
    maskedPixelCount: width * height - pixelCount,
  });
  return {
    ...metrics,
    passed: rawMetrics.mae <= DESIGN_ACCEPTANCE_THRESHOLDS.mae
      && rawMetrics.delta16Percent <= DESIGN_ACCEPTANCE_THRESHOLDS.delta16Percent
      && rawMetrics.delta32Percent <= DESIGN_ACCEPTANCE_THRESHOLDS.delta32Percent
      && rawMetrics.ssim >= DESIGN_ACCEPTANCE_THRESHOLDS.ssim,
    ssimPassed: rawMetrics.ssim >= ssimThreshold,
  };
}
