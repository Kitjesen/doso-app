type AdaptivePageInput = {
  containerWidth: number;
  windowHeight: number;
  isLandscape: boolean;
  fontScale: number;
  variant: 'home' | 'tasks' | 'map' | 'profile' | 'analysis';
};

// containerWidth is measured AFTER the app shell's safe-area and navigation
// reservation. Never subtract those insets a second time, or assume px === dp.
export function getAdaptivePageLayout({ containerWidth, windowHeight, isLandscape, fontScale, variant }: AdaptivePageInput) {
  const measuredWidth = Number.isFinite(containerWidth) ? Math.max(0, Math.floor(containerWidth)) : 0;
  const isCompactHeight = !Number.isFinite(windowHeight) || windowHeight < 480;
  const readableScale = Number.isFinite(fontScale) && fontScale > 0 && fontScale <= 1.3;
  // Controller panes scroll separately. Keep 320 for the seven-day selector,
  // 252 for wrapping instructions, plus 12 gap and 24 outer padding.
  // Profile needs at least 320/280 for device and settings; unlike Home/Tasks,
  // its short-height split also remains useful in wider controller containers.
  const isCompactColumns = (variant === 'home' || variant === 'tasks' || variant === 'profile') && isLandscape
    && measuredWidth >= (variant === 'profile' ? 660 : 608) && (variant === 'profile' || measuredWidth < 880)
    && Number.isFinite(windowHeight) && windowHeight >= 240 && windowHeight < 480
    && readableScale && fontScale <= 1.2;
  const padding = Math.min(measuredWidth / 2, isCompactColumns ? 12 : measuredWidth >= 880 ? 24 : 16);
  const gap = isCompactColumns ? 12 : padding === 24 ? 24 : 16;
  const contentWidth = Math.max(0, measuredWidth - padding * 2);
  const useColumns = isCompactColumns || (isLandscape && !isCompactHeight && contentWidth >= 800 && readableScale);
  const remainingWidth = Math.max(0, contentWidth - gap);
  const primaryWidth = !useColumns ? contentWidth : isCompactColumns
    ? variant === 'tasks' ? 320 : Math.floor(remainingWidth * 0.52)
    : (variant === 'home' || variant === 'profile' || variant === 'analysis')
    ? Math.floor(remainingWidth * 0.555)
    : Math.max(320, Math.min(360, Math.floor(remainingWidth * 0.395)));
  const secondaryWidth = useColumns ? contentWidth - primaryWidth - gap : contentWidth;
  return { useColumns, contentWidth, primaryWidth, secondaryWidth, padding, gap, isCompactHeight, isCompactColumns };
}
