export const MODEL_SELECT_HORIZONTAL_PADDING = 20;
export const MODEL_SELECT_PORTRAIT_HORIZONTAL_PADDING = 22;
export const MODEL_SELECT_PORTRAIT_CARD_GAP = 12;
export const MODEL_SELECT_PORTRAIT_BASE_CARD_WIDTH = 167;
export const MODEL_SELECT_PORTRAIT_CARD_HEIGHT = 240;
export const MODEL_SELECT_LARGE_TEXT_MAX_CARD_WIDTH = 360;
export const MODEL_SELECT_LARGE_TEXT_CARD_HEIGHT = 260;
export const MODEL_SELECT_HEADER_SIDE_WIDTH = 48;
export const MODEL_SELECT_HEADER_PROGRESS_MAX_WIDTH = 170;

export const MODEL_SELECT_LANDSCAPE_BASE_LEFT_WIDTH = 376;
export const MODEL_SELECT_LANDSCAPE_BASE_GAP = 20;
export const MODEL_SELECT_LANDSCAPE_BASE_RIGHT_WIDTH = 408;
export const MODEL_SELECT_LANDSCAPE_MIN_LEFT_WIDTH = 304;
export const MODEL_SELECT_LANDSCAPE_MIN_GAP = 16;
export const MODEL_SELECT_LANDSCAPE_CARD_GAP = 16;
export const MODEL_SELECT_LANDSCAPE_MIN_CARD_WIDTH = 144;
export const MODEL_SELECT_LANDSCAPE_MIN_RIGHT_WIDTH = MODEL_SELECT_LANDSCAPE_MIN_CARD_WIDTH * 2
  + MODEL_SELECT_LANDSCAPE_CARD_GAP;
export const MODEL_SELECT_LANDSCAPE_CARD_HEIGHT = 166;
export const MODEL_SELECT_LANDSCAPE_CONTROL_MAX_WIDTH = 355;

const BASE_GRID_WIDTH = MODEL_SELECT_LANDSCAPE_BASE_LEFT_WIDTH
  + MODEL_SELECT_LANDSCAPE_BASE_GAP
  + MODEL_SELECT_LANDSCAPE_BASE_RIGHT_WIDTH;
const MIN_GRID_WIDTH = MODEL_SELECT_LANDSCAPE_MIN_LEFT_WIDTH
  + MODEL_SELECT_LANDSCAPE_MIN_GAP
  + MODEL_SELECT_LANDSCAPE_MIN_RIGHT_WIDTH;

export type ModelSelectLayoutMetrics = {
  availableContentWidth: number;
  cardGap: number;
  cardHeight: number;
  cardWidth: number;
  cardsPerRow: 1 | 2 | 3;
  controlWidth: number | '100%';
  gridGap: number;
  headerContentWidth: number;
  headerProgressWidth: number;
  isLandscape: boolean;
  largeText: boolean;
  leftColumnWidth: number | '100%';
  rightColumnWidth: number | '100%';
  usesColumns: boolean;
};

type ModelSelectLayoutInput = {
  containerWidth: number;
  isLandscape: boolean;
  largeText?: boolean;
};

function getHeaderProgressWidth(contentWidth: number) {
  return Math.max(
    0,
    Math.min(
      MODEL_SELECT_HEADER_PROGRESS_MAX_WIDTH,
      contentWidth - MODEL_SELECT_HEADER_SIDE_WIDTH * 2,
    ),
  );
}

export function findVisibleSelectedModel<T extends { id: string }>(
  visibleModels: readonly T[],
  selectedId: string,
): T | null {
  return visibleModels.find((model) => model.id === selectedId) ?? null;
}

export function getModelSelectLayoutMetrics({
  containerWidth,
  isLandscape,
  largeText = false,
}: ModelSelectLayoutInput): ModelSelectLayoutMetrics {
  const measuredWidth = Math.max(0, Math.floor(containerWidth));
  const landscapeContentWidth = Math.max(
    0,
    measuredWidth - MODEL_SELECT_HORIZONTAL_PADDING * 2,
  );
  const usesColumns = isLandscape && !largeText && landscapeContentWidth >= MIN_GRID_WIDTH;
  const horizontalPadding = usesColumns
    ? MODEL_SELECT_HORIZONTAL_PADDING * 2
    : MODEL_SELECT_PORTRAIT_HORIZONTAL_PADDING * 2;
  const availableContentWidth = Math.max(0, measuredWidth - horizontalPadding);

  if (!usesColumns) {
    const cardWidth = largeText
      ? Math.max(0, Math.min(MODEL_SELECT_LARGE_TEXT_MAX_CARD_WIDTH, availableContentWidth))
      : Math.max(
          0,
          Math.min(
            MODEL_SELECT_PORTRAIT_BASE_CARD_WIDTH,
            Math.floor((availableContentWidth - MODEL_SELECT_PORTRAIT_CARD_GAP) / 2),
          ),
        );

    return {
      availableContentWidth,
      cardGap: MODEL_SELECT_PORTRAIT_CARD_GAP,
      cardHeight: largeText ? MODEL_SELECT_LARGE_TEXT_CARD_HEIGHT : MODEL_SELECT_PORTRAIT_CARD_HEIGHT,
      cardWidth,
      cardsPerRow: largeText ? 1 : 2,
      controlWidth: '100%',
      gridGap: MODEL_SELECT_PORTRAIT_CARD_GAP,
      headerContentWidth: availableContentWidth,
      headerProgressWidth: getHeaderProgressWidth(availableContentWidth),
      isLandscape,
      largeText,
      leftColumnWidth: '100%',
      rightColumnWidth: '100%',
      usesColumns,
    };
  }

  const wide = availableContentWidth >= BASE_GRID_WIDTH;
  const interpolation = wide
    ? 1
    : (availableContentWidth - MIN_GRID_WIDTH) / (BASE_GRID_WIDTH - MIN_GRID_WIDTH);
  const leftColumnWidth = Math.round(Math.min(
    wide ? 420 : MODEL_SELECT_LANDSCAPE_BASE_LEFT_WIDTH,
    MODEL_SELECT_LANDSCAPE_MIN_LEFT_WIDTH
      + (MODEL_SELECT_LANDSCAPE_BASE_LEFT_WIDTH - MODEL_SELECT_LANDSCAPE_MIN_LEFT_WIDTH) * interpolation
      + (wide ? Math.min(44, (availableContentWidth - BASE_GRID_WIDTH) * 0.04) : 0),
  ));
  const gridGap = wide
    ? 24
    : Math.round(
      MODEL_SELECT_LANDSCAPE_MIN_GAP
        + (MODEL_SELECT_LANDSCAPE_BASE_GAP - MODEL_SELECT_LANDSCAPE_MIN_GAP) * interpolation,
    );
  const rightColumnWidth = availableContentWidth - leftColumnWidth - gridGap;
  const cardWidth = Math.min(
    wide ? 320 : Number.POSITIVE_INFINITY,
    Math.floor((rightColumnWidth - MODEL_SELECT_LANDSCAPE_CARD_GAP) / 2),
  );

  return {
    availableContentWidth,
    cardGap: MODEL_SELECT_LANDSCAPE_CARD_GAP,
    cardHeight: wide ? 220 : MODEL_SELECT_LANDSCAPE_CARD_HEIGHT,
    cardWidth,
    cardsPerRow: 2,
    controlWidth: Math.min(MODEL_SELECT_LANDSCAPE_CONTROL_MAX_WIDTH, leftColumnWidth),
    gridGap,
    headerContentWidth: availableContentWidth,
    headerProgressWidth: getHeaderProgressWidth(availableContentWidth),
    isLandscape,
    largeText,
    leftColumnWidth,
    rightColumnWidth,
    usesColumns,
  };
}
