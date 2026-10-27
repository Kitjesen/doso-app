export type ControlLayoutMetrics = {
  contentWidth: number;
  availableContentWidth: number;
  horizontalPadding: number;
  joystickSize: number;
  joystickGap: number;
  useColumns: boolean;
  sectionGap: number;
  mapPanelWidth: number;
  manualPanelWidth: number;
  operationGroupWidth: number;
  operationsPanelWidth: number;
  mainPanelWidth: number;
  workspaceHeight: number;
};

type ControlLayoutInput = {
  containerHeight: number;
  containerWidth: number;
  isLandscape: boolean;
  fontScale?: number;
};

export function getControlLayoutMetrics({ containerHeight, containerWidth, isLandscape, fontScale = 1 }: ControlLayoutInput): ControlLayoutMetrics {
  const contentWidth = Number.isFinite(containerWidth) ? Math.max(0, Math.floor(containerWidth)) : 0;
  const contentHeight = Number.isFinite(containerHeight) ? Math.max(0, Math.floor(containerHeight)) : 0;
  const horizontalPadding = Math.min(contentWidth / 2, isLandscape ? 16 : 20);
  const availableContentWidth = Math.max(0, contentWidth - horizontalPadding * 2);
  const useColumns = isLandscape && availableContentWidth >= 600 && Number.isFinite(fontScale) && fontScale <= 1.35;
  const sectionGap = 12;
  const operationsPanelWidth = useColumns ? Math.min(224, Math.floor(availableContentWidth * 0.32)) : availableContentWidth;
  const mainPanelWidth = useColumns ? availableContentWidth - operationsPanelWidth - sectionGap : availableContentWidth;
  const mapPanelWidth = useColumns ? Math.floor((mainPanelWidth - sectionGap) * 0.42) : availableContentWidth;
  const manualPanelWidth = useColumns ? mainPanelWidth - sectionGap - mapPanelWidth : availableContentWidth;
  const operationGroupWidth = operationsPanelWidth;
  // Independent landscape panes reserve normal-text header/summary space, so
  // long unavailable reasons cannot push the map or pads below the first fold.
  const workspaceHeight = useColumns ? Math.max(0, contentHeight - 136) : 0;
  const padWidth = Math.max(0, manualPanelWidth - 24);
  const joystickGap = Math.min(useColumns ? 20 : 24, padWidth);
  const widthBound = Math.max(0, Math.floor((padWidth - joystickGap) / 2));
  // Reserve header, status, labels and safe spacing before allocating pad height.
  // A short viewport scrolls the information panels, never enlarges the sticks.
  const heightBound = Math.max(0, contentHeight - 280);
  const boundedSize = Math.min(144, widthBound, heightBound);
  const joystickSize = boundedSize >= 48 ? boundedSize : 0;
  return { contentWidth, availableContentWidth, horizontalPadding, joystickSize, joystickGap, useColumns, sectionGap, mapPanelWidth, manualPanelWidth, operationGroupWidth, operationsPanelWidth, mainPanelWidth, workspaceHeight };
}
