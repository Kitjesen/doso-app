type DevicePageLayoutInput = {
  width: number;
  height: number;
  insetLeft?: number;
  insetRight?: number;
  containerWidth?: number;
};

const nonNegative = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;

// Prefer the measured ScrollView inside SafeAreaView: native resize/rotation
// can reach it before the JS window metrics and safe-area context agree.
export function getDevicePageLayout({ width, height, insetLeft = 0, insetRight = 0, containerWidth }: DevicePageLayoutInput) {
  const gutter = width < 360 ? 16 : 24;
  const safeWidth = containerWidth ?? nonNegative(width) - nonNegative(insetLeft) - nonNegative(insetRight);
  const contentWidth = Math.floor(Math.max(0, Math.min(960,
    nonNegative(safeWidth) - gutter * 2,
  )));
  const usesColumns = width >= 700 && width > height && contentWidth >= 600;
  const gap = usesColumns ? 24 : 0;
  const introWidth = usesColumns ? Math.round((contentWidth - gap) * 0.46) : contentWidth;
  const detailsWidth = usesColumns ? contentWidth - gap - introWidth : contentWidth;
  return { contentWidth, introWidth, detailsWidth, gap, usesColumns };
}
