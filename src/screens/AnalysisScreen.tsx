import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Image, LayoutChangeEvent, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';

import { images } from '../assets';
import { ANALYSIS_PREVIEW } from '../features/analysis/analysisPreview';
import { radii, screenPadding, ThemeColors, useAppTheme } from '../theme';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';
import { getAdaptivePageLayout } from '../layout/adaptiveLayout';

type Props = {
  previewMode: boolean;
};

export function AnalysisScreen({ previewMode }: Props) {
  const { colors, isDark } = useAppTheme();
  const { height, width, fontScale } = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const isLandscape = width > height;
  const layout = getAdaptivePageLayout({
    containerWidth: viewport.width, windowHeight: viewport.height, isLandscape, fontScale, variant: 'analysis',
  });
  const measureContainer = ({ nativeEvent: { layout: measured } }: LayoutChangeEvent) => {
    const next = { width: Math.max(0, Math.floor(measured.width)), height: Math.max(0, Math.floor(measured.height)) };
    setViewport(current => current.width === next.width && current.height === next.height ? current : next);
  };
  const styles = useMemo(
    () => createStyles(colors, isDark, isLandscape),
    [colors, isDark, isLandscape],
  );

  if (!previewMode) {
    return <TrustedTelemetryEmptyState colors={colors} layout={layout} onLayout={measureContainer} styles={styles} />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.previewContent}
      contentInsetAdjustmentBehavior="automatic"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <PerformancePreview isDark={isDark} isLandscape={isLandscape} styles={styles} />
      <MonthlyPreview isDark={isDark} isLandscape={isLandscape} styles={styles} />
    </ScrollView>
  );
}

function PerformancePreview({
  isDark,
  isLandscape,
  styles,
}: {
  isDark: boolean;
  isLandscape: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Image
      accessibilityLabel={`性能预览：总距离 ${ANALYSIS_PREVIEW.distance}，任务 ${ANALYSIS_PREVIEW.metrics[0].value}，运行时长 ${ANALYSIS_PREVIEW.metrics[1].value}，平均温度 ${ANALYSIS_PREVIEW.metrics[2].value}`}
      resizeMode="stretch"
      source={isLandscape ? images.analysisPerformanceLandscape : isDark ? images.analysisPerformanceDark : images.analysisPerformanceLight}
      style={styles.performanceArtwork}
    />
  );
}

function MonthlyPreview({
  isDark,
  isLandscape,
  styles,
}: {
  isDark: boolean;
  isLandscape: boolean;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <Image
      accessibilityLabel={`${ANALYSIS_PREVIEW.month}性能预览，任务活动趋势 ${ANALYSIS_PREVIEW.trend}，预览数据，不代表真实设备记录`}
      resizeMode="stretch"
      source={isLandscape ? images.analysisMonthlyLandscape : isDark ? images.analysisMonthlyDark : images.analysisMonthlyLight}
      style={styles.monthlyArtwork}
    />
  );
}

function TrustedTelemetryEmptyState({
  colors,
  layout,
  onLayout,
  styles,
}: {
  colors: ThemeColors;
  layout: ReturnType<typeof getAdaptivePageLayout>;
  onLayout: (event: LayoutChangeEvent) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <ScrollView testID="analysis-empty-scroll" onLayout={onLayout} contentContainerStyle={[styles.emptyContent, { paddingHorizontal: layout.padding }]} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
      <Text accessibilityRole="header" style={styles.emptyPageTitle}>数据分析</Text>
      <Text style={styles.emptyPageSubtitle}>查看机器人上报的历史数据</Text>

      <View testID="analysis-state-columns" style={[styles.stateColumns, { flexDirection: layout.useColumns ? 'row' : 'column', gap: layout.gap }]}>
        <View testID="analysis-empty-card" style={[styles.emptyCard, layout.useColumns && { width: layout.primaryWidth }]}>
          <View style={styles.emptyIconBubble}>
            <Ionicons color={colors.authPrimary} name="analytics-outline" size={30} />
          </View>
          <Text style={styles.emptyTitle}>尚未同步可信遥测</Text>
          <Text style={styles.emptyText}>设备连接并同步后，距离、任务和运行记录会显示在这里。</Text>
          <View style={styles.sourceRow}>
            <Text style={styles.sourceLabel}>数据来源</Text>
            <Text style={styles.sourceValue}>机器人上报，待同步</Text>
          </View>
        </View>
        <View testID="analysis-availability-card" style={[styles.availabilityCard, layout.useColumns && { width: layout.secondaryWidth }]}>
          <Text accessibilityRole="header" style={styles.availabilityTitle}>数据可用性</Text>
          <Text style={styles.availabilityDescription}>收到机器人上报后，才会生成历史记录。</Text>
          {['距离记录', '任务记录', '运行记录'].map(label => (
            <View key={label} style={styles.availabilityRow}>
              <Text style={styles.availabilityLabel}>{label}</Text>
              <Text style={styles.availabilityValue}>待同步</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.note}>
        <Ionicons color={colors.muted} name="information-circle-outline" size={20} />
        <Text style={styles.noteText}>当前尚未接入历史数据服务。没有收到的记录不会显示为 0，也不会用演示数据代替。</Text>
      </View>
    </ScrollView>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean, isLandscape: boolean) {
  const p = getProductAppearance(isDark);
  const previewStatusBackground = 'transparent';
  const previewStatusText = p.blueInk;
  const dateSurface = 'transparent';
  const dateCircle = p.surface;

  return StyleSheet.create({
    previewContent: {
      alignItems: isLandscape ? 'flex-start' : 'center',
      flexDirection: isLandscape ? 'row' : 'column',
      flexWrap: isLandscape ? 'wrap' : 'nowrap',
      flexGrow: 1,
      gap: isLandscape ? 39 : 7,
      paddingBottom: isLandscape ? 8 : 0,
      paddingHorizontal: isLandscape ? 25 : screenPadding,
      paddingTop: 0,
    },
    performanceCard: {
      alignSelf: isLandscape ? 'flex-start' : 'center',
      backgroundColor: p.surface,
      borderRadius: cardLayout.radius,
      height: isLandscape ? 258 : 235,
      maxWidth: 350,
      marginTop: isLandscape ? 85 : 0,
      overflow: 'hidden',
      paddingBottom: 18,
      paddingHorizontal: 20,
      paddingTop: 20,
      width: isLandscape ? 325 : '100%',
    },
    performanceArtwork: { height: isLandscape ? 258 : 235, marginTop: 4, width: isLandscape ? 325 : 350, maxWidth: '100%' },
    performanceGlow: {
      backgroundColor: 'transparent',
      height: 0,
      position: 'absolute',
      right: 0,
      top: 0,
      width: 0,
    },
    performanceTitleRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 23,
    },
    cardTitle: { ...typography.label, color: colors.ink },
    previewStatus: {
      alignItems: 'center',
      backgroundColor: previewStatusBackground,
      borderRadius: radii.pill,
      flexDirection: 'row',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    statusDot: { backgroundColor: p.blueInk, borderRadius: 3, height: 6, width: 6 },
    previewStatusText: { ...typography.supporting, color: previewStatusText },
    distanceRow: {
      alignItems: 'center',
      borderBottomColor: colors.line,
      borderBottomWidth: StyleSheet.hairlineWidth,
      flexDirection: 'row',
      gap: 10,
      marginTop: 16,
      minHeight: 73,
      paddingBottom: 16,
    },
    distanceIcon: {
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderRadius: 20,
      height: 40,
      justifyContent: 'center',
      width: 40,
    },
    distanceIconGlyph: { transform: [{ rotate: '-45deg' }] },
    distanceCopy: { flex: 1 },
    distanceValue: { color: colors.ink, fontSize: 32, fontWeight: '800', lineHeight: 36 },
    metricGrid: { flex: 1, flexDirection: 'row', paddingTop: 16 },
    metric: { flex: 1, justifyContent: 'center', minWidth: 0, paddingHorizontal: 12 },
    metricDivider: { borderRightColor: colors.line, borderRightWidth: StyleSheet.hairlineWidth },
    metricIcon: {
      alignItems: 'center',
      backgroundColor: 'transparent',
      borderRadius: 11,
      height: 22,
      justifyContent: 'center',
      width: 22,
    },
    metricValue: { color: colors.ink, fontSize: 17, fontWeight: '800', lineHeight: 26, marginTop: 4 },
    metricLabel: { color: colors.muted, fontSize: 11, lineHeight: 17 },
    monthlyCard: {
      alignSelf: isLandscape ? 'flex-start' : 'center',
      backgroundColor: p.surface,
      borderRadius: cardLayout.radius,
      height: isLandscape ? 380 : 399,
      maxWidth: 350,
      marginTop: isLandscape ? 25 : 0,
      overflow: 'hidden',
      padding: 6,
      width: isLandscape ? 340 : '100%',
    },
    monthlyArtwork: { height: isLandscape ? 339 : 399, marginTop: 4, width: isLandscape ? 340 : 350, maxWidth: '100%' },
    monthlyTop: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 62,
      paddingHorizontal: 10,
      paddingTop: 9,
    },
    monthLabel: { color: colors.muted, fontSize: 20, fontWeight: '500', lineHeight: 22 },
    monthSubtitle: { color: colors.muted, fontSize: 13, fontWeight: '800', lineHeight: 19, marginTop: 2 },
    monthActions: { flexDirection: 'row', gap: 6 },
    monthAction: {
      alignItems: 'center',
      backgroundColor: dateSurface,
      borderRadius: 12,
      height: 39,
      justifyContent: 'center',
      width: 39,
    },
    monthActionIcon: { color: colors.ink },
    dateGrid: {
      borderRadius: 30,
      borderWidth: 0,
      flexDirection: 'row',
      gap: 4,
      height: 102,
      paddingHorizontal: 4,
      paddingTop: 2,
    },
    datePill: {
      alignItems: 'center',
      backgroundColor: dateSurface,
      borderRadius: 21,
      borderWidth: 0,
      flex: 1,
      gap: 8,
      justifyContent: 'center',
      maxHeight: 86,
      minWidth: 0,
      paddingBottom: 10,
      paddingTop: 13,
    },
    datePillSelected: {
      alignItems: 'center',
      borderRadius: 21,
      flex: 1,
      gap: 8,
      justifyContent: 'center',
      maxHeight: 86,
      minWidth: 0,
      paddingBottom: 10,
      paddingTop: 13,
    },
    dateDay: { color: colors.muted, fontSize: 14, lineHeight: 18 },
    dateDaySelected: { ...typography.supporting, color: p.actionInk },
    dateCircle: {
      alignItems: 'center',
      backgroundColor: dateCircle,
      borderRadius: 20,
      height: 39,
      justifyContent: 'center',
      width: 39,
    },
    dateCircleSelected: {
      alignItems: 'center',
      backgroundColor: p.action,
      borderRadius: 20,
      height: 39,
      justifyContent: 'center',
      width: 39,
    },
    dateNumber: { color: colors.muted, fontSize: 15, opacity: 0.62 },
    dateNumberSelected: { ...typography.label, color: p.actionInk },
    chartBlock: { height: 123, marginTop: 4, paddingTop: 10 },
    chartImage: { alignSelf: 'center', height: 98, width: '100%' },
    chartLabels: { flexDirection: 'row', justifyContent: 'space-between' },
    chartLabel: { color: colors.muted, fontSize: 9, fontWeight: '500', lineHeight: 15 },
    summaryCard: {
      alignItems: 'center',
      backgroundColor: p.surface,
      borderRadius: cardLayout.radius,
      flexDirection: 'row',
      justifyContent: 'space-between',
      minHeight: 74,
      paddingHorizontal: 16,
    },
    summaryCopy: { flex: 1, minWidth: 0, paddingRight: 8 },
    summaryTitle: { ...typography.label, color: colors.ink },
    previewDisclosure: { ...typography.supporting, color: colors.muted },
    summaryTrend: { alignItems: 'flex-end' },
    trendValue: { ...typography.label, color: p.blueInk },
    trendLabel: { ...typography.supporting, color: colors.muted },
    emptyContent: {
      flexGrow: 1,
      paddingBottom: 28,
      paddingHorizontal: screenPadding,
      paddingTop: 4,
    },
    emptyPageTitle: { ...typography.pageTitle, color: colors.ink },
    emptyPageSubtitle: { ...typography.secondary, color: colors.muted, marginTop: 4 },
    stateColumns: { alignItems: 'stretch', marginTop: 18 },
    emptyCard: {
      alignItems: 'center',
      backgroundColor: p.surface,
      borderRadius: cardLayout.radius,
      minWidth: 0,
      padding: cardLayout.inset,
    },
    emptyIconBubble: {
      alignItems: 'center',
      borderRadius: 30,
      height: 60,
      justifyContent: 'center',
      width: 60,
    },
    emptyTitle: { ...typography.compactTitle, color: colors.ink, marginTop: 12, textAlign: 'center' },
    emptyText: { ...typography.secondary, color: colors.muted, marginTop: 8, maxWidth: 460, textAlign: 'center' },
    sourceRow: {
      alignItems: 'center',
      alignSelf: 'stretch',
      borderRadius: radii.md,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      justifyContent: 'space-between',
      marginTop: 20,
      minHeight: 54,
      paddingHorizontal: 15,
      paddingVertical: 12,
    },
    sourceLabel: { ...typography.secondary, color: colors.muted },
    sourceValue: { ...typography.secondary, color: colors.inkSoft, fontWeight: '600' },
    availabilityCard: { backgroundColor: p.surface, borderRadius: cardLayout.radius, minWidth: 0, padding: cardLayout.inset },
    availabilityTitle: { ...typography.sectionTitle, color: colors.ink },
    availabilityDescription: { ...typography.secondary, color: colors.muted, marginTop: 6, marginBottom: 8 },
    availabilityRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 48, paddingVertical: 10 },
    availabilityLabel: { ...typography.body, color: colors.ink },
    availabilityValue: { ...typography.secondary, color: colors.muted },
    note: {
      alignItems: 'flex-start',
      borderRadius: cardLayout.radius,
      flexDirection: 'row',
      gap: 10,
      marginTop: 14,
      padding: cardLayout.inset,
    },
    noteText: { ...typography.secondary, color: colors.inkSoft, flex: 1 },
  });
}
