import { getAdaptivePageLayout } from '../layout/adaptiveLayout';

export type ProfileLayoutMetrics = {
  availableGridWidth: number;
  contentWidth: number;
  controlsColumnWidth: number | '100%';
  deviceColumnWidth: number | '100%';
  gridGap: number;
  isLandscape: boolean;
  isCompactColumns: boolean;
  padding: number;
  usesColumns: boolean;
};

type ProfileLayoutInput = {
  containerWidth: number;
  isLandscape: boolean;
  fontScale: number;
  windowHeight: number;
};

// Safe areas and the navigation rail are already reserved by the app shell.
// Profile only arranges the measured content viewport; it never reclaims insets.
export function getProfileLayoutMetrics(input: ProfileLayoutInput): ProfileLayoutMetrics {
  const layout = getAdaptivePageLayout({ ...input, variant: 'profile' });
  return {
    availableGridWidth: layout.contentWidth,
    contentWidth: layout.contentWidth,
    controlsColumnWidth: layout.useColumns ? layout.secondaryWidth : '100%',
    deviceColumnWidth: layout.useColumns ? layout.primaryWidth : '100%',
    gridGap: layout.useColumns ? layout.gap : 20,
    isLandscape: input.isLandscape,
    isCompactColumns: layout.isCompactColumns,
    padding: layout.padding,
    usesColumns: layout.useColumns,
  };
}
