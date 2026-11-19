import { Feather } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/HomeText';
import { TrackPanel } from '../components/TrackPanel';
import { ANALYSIS_PREVIEW, type AnalysisRange } from '../features/analysis/analysisPreview';
import { useAppTheme } from '../theme';

type Props = { previewMode: boolean; expectedUserId?: string; deviceId?: string };

export function AnalysisScreen({ previewMode, expectedUserId, deviceId }: Props) {
  useFonts({ HomeRegular: require('../../assets/fonts/MiSans-Regular.otf'), HomeBold: require('../../assets/fonts/MiSans-Bold.otf') });
  const { isDark } = useAppTheme();
  const { width, fontScale } = useWindowDimensions();
  const styles = createStyles(isDark);
  const [range, setRange] = useState<AnalysisRange>('7天');
  const [selectedBar, setSelectedBar] = useState(2);
  const series = ANALYSIS_PREVIEW.ranges[range];
  const selected = series.bars[Math.min(selectedBar, series.bars.length - 1)];
  const total = series.bars.reduce((sum, bar) => sum + bar.hours, 0);
  const maximum = Math.max(1, Math.ceil(Math.max(...series.bars.map(bar => bar.hours)) / 2) * 2);
  const wide = width >= 860 && fontScale <= 1.3;
  const liveHistory = !previewMode && !!expectedUserId && !!deviceId;
  const selectRange = (next: AnalysisRange) => { setRange(next); setSelectedBar(0); };

  return <ScrollView testID={previewMode ? 'analysis-preview-scroll' : liveHistory ? 'analysis-live-scroll' : 'analysis-empty-scroll'} style={styles.root}
    contentContainerStyle={styles.page} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
    <View style={styles.header}>
      <Text style={styles.title}>运行数据</Text>
      {previewMode ? <View style={styles.ranges} accessibilityRole="tablist">
        {(['今日', '7天', '30天'] as const).map(value => <Pressable key={value} testID={`analysis-range-${value}`}
          accessibilityRole="tab" accessibilityState={{ selected: value === range }} accessibilityLabel={`查看${value}运行数据`}
          onPress={() => selectRange(value)} style={[styles.range, range === value && styles.selectedRange]}>
          <Text style={[styles.rangeText, range === value && styles.selectedRangeText]}>{value}</Text>
        </Pressable>)}
      </View> : null}
    </View>
    {previewMode ? <View style={[styles.columns, wide && styles.wideColumns]}>
      <View style={styles.mainColumn}>
        <View style={styles.headline}>
          <View><Text style={styles.total} testID="analysis-total">{total.toFixed(1)}<Text style={styles.unit}> 小时</Text></Text><Text style={styles.caption}>累计运行</Text></View>
          <View style={styles.period}><Text style={styles.periodValue}>{series.label}</Text><Text style={styles.caption}>统计区间</Text></View>
        </View>
        <View style={styles.chart} testID="analysis-chart">
          <Text accessibilityLiveRegion="polite" style={styles.selection} testID="analysis-selected-value">{selected.label} · {selected.hours.toFixed(1)} h</Text>
          <View style={styles.plot}>
            {[maximum, maximum / 2, 0].map((tick, index) => <View key={tick} pointerEvents="none" style={[styles.gridLine, { top: `${index * 50}%` }]}><Text style={styles.axis}>{tick}h</Text></View>)}
            <View style={styles.barRow}>
              {series.bars.map((bar, index) => <Pressable key={bar.label} testID={`analysis-bar-${index}`} accessibilityRole="button"
                accessibilityLabel={`${bar.label}运行${bar.hours.toFixed(1)}小时`} accessibilityState={{ selected: selectedBar === index }}
                onPress={() => setSelectedBar(index)} style={styles.barCell}>
                <View style={[styles.bar, { height: `${bar.hours / maximum * 100}%` }, selectedBar === index && styles.barSelected]} />
              </Pressable>)}
            </View>
          </View>
          <View style={styles.barLabels}>{series.bars.map(bar => <Text key={bar.label} style={styles.barLabel}>{bar.label}</Text>)}</View>
        </View>
        <View style={styles.metrics}>
          {[{ value: String(series.completed), label: '完成任务' }, { value: series.completion, label: '完成率' }, { value: `${series.distanceKm.toFixed(1)} km`, label: 'GPS 估算里程' }].map((metric, index) => <View key={metric.label} style={[styles.metric, index > 0 && styles.metricDivider]}><Text style={styles.metricValue}>{metric.value}</Text><Text style={styles.caption}>{metric.label}</Text></View>)}
        </View>
      </View>
      <View style={styles.secondaryColumn}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>任务分布</Text>
          {series.tasks.map((task, index) => <View key={task.name} style={styles.distributionRow}><Text style={styles.taskName}>{task.name}</Text><View style={styles.distributionTrack}><View style={[styles.distributionFill, { width: `${task.count / Math.max(1, series.completed) * 100}%`, opacity: 1 - index * .23 }]} /></View><Text style={styles.count}>{task.count}</Text></View>)}
        </View>
        <View style={styles.section}>
          <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>运行活跃度</Text><Text style={styles.caption}>每格 2 小时</Text></View>
          {!series.activity.length ? <Text style={styles.caption}>该区间暂无小时分布</Text> : null}
          <View style={styles.heatLabels}><View style={styles.heatDay} />{['00', '', '', '06', '', '', '12', '', '', '18', '', ''].map((label, index) => <Text key={index} style={styles.heatLabel}>{label}</Text>)}</View>
          {series.activity.map((row, index) => <View key={index} style={styles.heatRow}><Text style={styles.heatDay}>{series.activityLabels[index]}</Text>{row.map((level, cell) => <View key={cell} accessibilityLabel={`${series.activityLabels[index]} ${cell * 2}至${cell * 2 + 2}时，${['无记录', '低', '中', '高'][level]}活跃度`} style={[styles.heatCell, { backgroundColor: isDark ? ['#2C2D2D', '#3B454B', '#536B7A', '#7795AA'][level] : ['#E8EAED', '#CAD5DC', '#9CB2C1', '#7795AA'][level] }]} />)}</View>)}
          <View style={styles.legend}><Text style={styles.caption}>少</Text>{[0, 1, 2, 3].map(level => <View key={level} style={[styles.legendCell, { backgroundColor: ['#303334', '#3B454B', '#536B7A', '#7795AA'][level] }]} />)}<Text style={styles.caption}>多</Text></View>
        </View>
      </View>
    </View> : liveHistory ? <View style={styles.live} testID="analysis-live-card">
      <View style={styles.liveHeader}>
        <View><Text style={styles.liveTitle}>设备历史轨迹</Text><Text style={styles.caption}>来自设备上报的 GPS 记录</Text></View>
        <Text style={styles.liveBadge}>真实数据</Text>
      </View>
      <TrackPanel expectedUserId={expectedUserId!} deviceId={deviceId!} authorized enabled fresh={false} simulated={false} />
      <View style={styles.liveNote}>
        <Feather name="info" color={isDark ? '#A0A09D' : '#656A70'} size={16} />
        <Text style={styles.caption}>任务完成数、运行时长和完成率需要设备任务历史接口，当前不会用模板数据填充。</Text>
      </View>
    </View> : <View style={styles.empty} testID="analysis-empty-card">
      <Feather name="bar-chart-2" color={isDark ? '#7795AA' : '#607C90'} size={36} />
      <Text style={styles.emptyTitle}>还没有运行记录</Text><Text style={styles.emptyText}>设备历史数据同步后，运行时长、任务和里程会显示在这里。</Text>
      <View style={styles.emptyMetrics}>{['运行时长', '完成任务', 'GPS 估算里程'].map(label => <View key={label} style={styles.emptyMetric}><Text style={styles.metricValue}>—</Text><Text style={styles.caption}>{label}</Text></View>)}</View>
      <Text style={styles.source}>数据来源：设备上报 · 待同步</Text>
    </View>}
  </ScrollView>;
}

function createStyles(dark: boolean) {
  const ink = dark ? '#E8E8E6' : '#24282B', secondary = dark ? '#A0A09D' : '#656A70', line = dark ? '#343634' : '#DEE2E5';
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: dark ? '#1C1C1B' : '#F5F6F9' }, page: { padding: 20, paddingBottom: 26, gap: 20 },
    header: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, title: { fontSize: 21, lineHeight: 29, color: ink, fontWeight: '600' },
    ranges: { flexDirection: 'row', padding: 3, borderRadius: 9, backgroundColor: dark ? '#242423' : '#E9EDF1' }, range: { minWidth: 52, minHeight: 44, paddingHorizontal: 10, justifyContent: 'center', alignItems: 'center', borderRadius: 7 }, selectedRange: { backgroundColor: dark ? '#3B3D3C' : '#FFFFFF' }, rangeText: { fontSize: 13, color: secondary }, selectedRangeText: { color: ink },
    columns: { gap: 22 }, wideColumns: { flexDirection: 'row', alignItems: 'flex-start' }, mainColumn: { flex: 1, minWidth: 0 }, secondaryColumn: { flex: 1, minWidth: 0, gap: 22 },
    headline: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, total: { fontSize: 35, lineHeight: 45, color: ink, fontWeight: '600', fontVariant: ['tabular-nums'] }, unit: { fontSize: 16, fontWeight: '400' }, caption: { fontSize: 13, lineHeight: 20, color: secondary }, period: { alignItems: 'flex-end', gap: 2 }, periodValue: { fontSize: 15, color: '#7795AA' },
    chart: { marginTop: 14, paddingTop: 2 }, selection: { fontSize: 13, color: ink, textAlign: 'center', minHeight: 30 }, plot: { height: 150, marginLeft: 28, marginTop: 6 }, gridLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderColor: line }, axis: { position: 'absolute', right: '100%', paddingRight: 7, top: -9, fontSize: 12, lineHeight: 18, color: secondary }, barRow: { flex: 1, flexDirection: 'row', alignItems: 'stretch', gap: 7, paddingHorizontal: 4 }, barCell: { flex: 1, minWidth: 20, justifyContent: 'flex-end', paddingHorizontal: 1 }, bar: { width: '100%', backgroundColor: dark ? '#484E51' : '#B7C0C7', borderTopLeftRadius: 4, borderTopRightRadius: 4, minHeight: 2 }, barSelected: { backgroundColor: '#7795AA' }, barLabels: { marginLeft: 28, flexDirection: 'row', paddingTop: 9, gap: 7, paddingHorizontal: 4 }, barLabel: { flex: 1, minWidth: 20, fontSize: 12, lineHeight: 18, color: secondary, textAlign: 'center' },
    metrics: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16, marginTop: 22, paddingVertical: 18, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: line }, metric: { flex: 1, minWidth: 84, paddingHorizontal: 10, gap: 3 }, metricDivider: { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: line }, metricValue: { fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'], color: ink, fontWeight: '500' },
    section: { gap: 14, paddingBottom: 20, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: line }, sectionTitle: { fontSize: 17, lineHeight: 24, color: ink, fontWeight: '600' }, sectionHeading: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }, distributionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 24 }, taskName: { color: secondary, fontSize: 13, width: 58 }, distributionTrack: { flex: 1, height: 7, borderRadius: 4, backgroundColor: dark ? '#353736' : '#E0E5E9', overflow: 'hidden' }, distributionFill: { height: '100%', borderRadius: 4, backgroundColor: '#7795AA' }, count: { color: ink, fontSize: 13, width: 20, textAlign: 'right', fontVariant: ['tabular-nums'] },
    heatLabels: { flexDirection: 'row', gap: 3 }, heatLabel: { flex: 1, color: secondary, fontSize: 10, lineHeight: 14 }, heatDay: { width: 28, fontSize: 11, lineHeight: 16, color: secondary }, heatRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: -8 }, heatCell: { flex: 1, aspectRatio: 1.3, borderRadius: 3 }, legend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }, legendCell: { width: 10, height: 10, borderRadius: 2 },
    empty: { paddingTop: 52, alignItems: 'center', gap: 16 }, emptyTitle: { fontSize: 21, lineHeight: 29, color: ink, fontWeight: '600' }, emptyText: { fontSize: 14, lineHeight: 23, color: secondary, textAlign: 'center', maxWidth: 400 }, emptyMetrics: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', gap: 20, justifyContent: 'space-around', paddingVertical: 26, marginTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: line }, emptyMetric: { alignItems: 'center', gap: 7 }, source: { color: secondary, fontSize: 13, lineHeight: 20 },
    live: { gap: 14 }, liveHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, liveTitle: { fontSize: 18, lineHeight: 25, color: ink, fontWeight: '600' }, liveBadge: { color: '#7795AA', fontSize: 13, lineHeight: 20 }, liveNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 4 },
  });
}
