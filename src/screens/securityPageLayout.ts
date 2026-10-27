const LANDSCAPE_PAGE_PADDING = 20;
const PORTRAIT_PAGE_PADDING = 24;
const GRID_GAP = 20;
const MIN_COLUMN_WIDTH = 330;

export type SecurityPageLayoutInput = {
  containerHeight: number;
  containerWidth: number;
  insetLeft?: number;
  insetRight?: number;
};

export type SecurityPageLayout = {
  columnWidth: number;
  contentWidth: number;
  gridGap: number;
  isLandscape: boolean;
  usesColumns: boolean;
};

export function getSecurityPageLayout({
  containerHeight,
  containerWidth,
  insetLeft = 0,
  insetRight = 0,
}: SecurityPageLayoutInput): SecurityPageLayout {
  const safeWidth = Math.max(0, containerWidth - Math.max(0, insetLeft) - Math.max(0, insetRight));
  const isLandscape = containerWidth > containerHeight;
  const pagePadding = isLandscape ? LANDSCAPE_PAGE_PADDING : PORTRAIT_PAGE_PADDING;
  const contentWidth = Math.max(0, safeWidth - pagePadding * 2);
  const usesColumns = isLandscape && contentWidth >= MIN_COLUMN_WIDTH * 2 + GRID_GAP;
  const columnWidth = usesColumns ? (contentWidth - GRID_GAP) / 2 : contentWidth;

  return {
    columnWidth,
    contentWidth,
    gridGap: GRID_GAP,
    isLandscape,
    usesColumns,
  };
}
