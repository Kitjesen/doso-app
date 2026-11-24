import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from './AppText';
import type { HudForwardDirection, HudHeadlightMode, HudTemperatureSeverity } from './controlHudModel';

export type ControlHudDashboardProps = Readonly<{
  expanded: boolean;
  inlineCollapsed?: boolean;
  compactInline?: boolean;
  scale?: number;
  maxWidth?: number;
  bottomOffset?: number;
  onToggleExpanded: () => void;
  headlightMode: HudHeadlightMode;
  frontVideoReceiving: boolean;
  rearVideoReceiving: boolean;
  remainingRangeKm?: number | null;
  batteryPercent?: number | null;
  voltageV?: number | null;
  minTempC?: number | null;
  maxTempC?: number | null;
  minTempSeverity?: HudTemperatureSeverity;
  maxTempSeverity?: HudTemperatureSeverity;
  forwardDirection: HudForwardDirection;
  jointTempOpen: boolean;
  jointParamsOpen: boolean;
  onToggleJointTemp: () => void;
  onToggleJointParams: () => void;
  onChargePress: () => void;
  onReverseDirection: () => void;
}>;

const ACTIVE_PILL = '#323232';
const ACTIVE_EMERALD = '#34D399';
const SURFACE_DARK = 'rgba(22, 22, 22, 0.92)';
const SURFACE_BORDER = 'rgba(255, 255, 255, 0.08)';
const MUTED_INK = '#9A9A9A';
const INK = '#F2F2F2';

function severityColor(severity: HudTemperatureSeverity | undefined): string {
  if (severity === 'protect') return '#EF4444';
  if (severity === 'warn') return '#F59E0B';
  if (severity === 'normal') return '#34D399';
  return MUTED_INK;
}

function resolveEnergyState(batteryPercent?: number | null, voltageV?: number | null) {
  if (typeof batteryPercent === 'number' && Number.isFinite(batteryPercent) && batteryPercent >= 0 && batteryPercent <= 100) {
    const pct = Math.round(batteryPercent);
    return {
      text: `${pct}%`,
      fillRatio: pct / 100,
      live: true,
      fillColor: pct <= 20 ? '#EF4444' : pct <= 40 ? '#F59E0B' : '#34D399',
    };
  }
  if (typeof voltageV === 'number' && Number.isFinite(voltageV) && voltageV > 0) {
    // Bus voltage normalized only visually within typical 42V-54.6V range while displaying exact Volts.
    const ratio = Math.min(1, Math.max(0.12, (voltageV - 42) / 12.6));
    return {
      text: `${voltageV.toFixed(1)}V`,
      fillRatio: ratio,
      live: true,
      fillColor: voltageV < 44 ? '#F59E0B' : '#34D399',
    };
  }
  return {
    text: '--',
    fillRatio: 0,
    live: false,
    fillColor: 'rgba(255, 255, 255, 0.22)',
  };
}

export function ControlHudDashboard({
  expanded,
  inlineCollapsed = false,
  compactInline = false,
  scale = 1,
  maxWidth,
  bottomOffset,
  onToggleExpanded,
  headlightMode,
  frontVideoReceiving,
  rearVideoReceiving,
  remainingRangeKm,
  batteryPercent,
  voltageV,
  minTempC,
  maxTempC,
  minTempSeverity,
  maxTempSeverity,
  forwardDirection,
  jointTempOpen,
  jointParamsOpen,
  onToggleJointTemp,
  onToggleJointParams,
  onChargePress,
  onReverseDirection,
}: ControlHudDashboardProps) {
  const s = Number.isFinite(scale) && scale > 0 ? Math.max(0.90, Math.min(1.22, scale)) : 1;
  const sp = (value: number) => Math.round(value * s);
  const fMeta = Math.max(11, Math.round(11.5 * s));
  const fMetaLine = sp(15);
  const fBody = sp(12.5);
  const fBodyLine = sp(17);
  const anyVideoOn = frontVideoReceiving || rearVideoReceiving;
  const energy = resolveEnergyState(batteryPercent, voltageV);
  const minTempText = typeof minTempC === 'number' && Number.isFinite(minTempC) ? `${Math.round(minTempC)}°C` : '--°C';
  const maxTempText = typeof maxTempC === 'number' && Number.isFinite(maxTempC) ? `${Math.round(maxTempC)}°C` : '--°C';

  if (!expanded) {
    if (inlineCollapsed) {
      const btnSize = compactInline ? 24 : sp(28);
      return (
        <View pointerEvents="box-none" style={styles.inlineRoot} testID="control-hud-dashboard">
          <View testID="control-hud-dashboard-collapsed">
            <Pressable
              accessibilityLabel="展开诊断栏"
              accessibilityRole="button"
              accessibilityState={{ expanded: false }}
              onPress={onToggleExpanded}
              style={({ pressed }) => [styles.inlineToggleOrb, { borderRadius: Math.round(btnSize / 2), height: btnSize, width: btnSize }, pressed && styles.pressed]}
              testID="control-hud-dashboard-toggle"
            >
              <Ionicons color={INK} name="chevron-up" size={compactInline ? 13 : sp(15)} />
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View pointerEvents="box-none" style={styles.collapsedRoot} testID="control-hud-dashboard">
        <Pressable
          accessibilityLabel="展开诊断栏"
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          onPress={onToggleExpanded}
          style={({ pressed }) => [styles.toggleOrb, pressed && styles.pressed]}
          testID="control-hud-dashboard-toggle"
        >
          <Ionicons color={INK} name="chevron-up" size={16} />
        </Pressable>
        <View style={styles.collapsedTray} testID="control-hud-dashboard-collapsed">
          <View style={styles.collapsedEnergyRow} testID="control-hud-battery-bar">
            <View style={styles.energyTrackCompact}>
              <View style={[styles.energyFillCompact, { width: `${Math.round(energy.fillRatio * 100)}%`, backgroundColor: energy.fillColor }]} />
            </View>
            <Text style={[styles.energyCompactText, energy.live && { color: INK }]}>{energy.text}</Text>
          </View>
          <View
            accessible
            accessibilityLabel={anyVideoOn ? '图传接收中' : '图传未开启'}
            style={[styles.sideIndicator, anyVideoOn && styles.sideIndicatorActive]}
            testID="control-hud-indicator-video"
          >
            <Ionicons color={anyVideoOn ? ACTIVE_EMERALD : MUTED_INK} name="videocam-outline" size={14} />
          </View>
        </View>
      </View>
    );
  }

  const resolvedMaxWidth = typeof maxWidth === 'number' && Number.isFinite(maxWidth) && maxWidth > 0
    ? Math.max(300, Math.min(sp(580), Math.round(maxWidth)))
    : sp(520);
  const resolvedBottom = typeof bottomOffset === 'number' && Number.isFinite(bottomOffset) && bottomOffset >= 0
    ? Math.round(bottomOffset)
    : sp(60);

  return (
    <View pointerEvents="box-none" style={[styles.expandedRoot, { bottom: resolvedBottom }]} testID="control-hud-dashboard">
      <View
        style={[
          styles.expandedBar,
          {
            borderRadius: sp(14),
            gap: sp(7),
            maxWidth: resolvedMaxWidth,
            paddingHorizontal: sp(10),
            paddingVertical: sp(6),
          },
        ]}
        testID="control-hud-dashboard-expanded"
      >
        <View style={[styles.expandedTelemetryRow, { gap: sp(6) }]} testID="control-hud-dashboard-dial">
          <View style={[styles.tempSummaryRow, { gap: sp(4) }]} testID="control-hud-temp-summary">
            <Ionicons color={MUTED_INK} name="thermometer-outline" size={sp(12)} />
            <Text style={[styles.tempSummaryText, { fontSize: fMeta, lineHeight: fMetaLine, color: severityColor(minTempSeverity) }]}>{minTempText}</Text>
            <View style={[styles.tempSummaryDivider, { height: sp(9) }]} />
            <Text style={[styles.tempSummaryText, { fontSize: fMeta, lineHeight: fMetaLine, color: severityColor(maxTempSeverity) }]}>{maxTempText}</Text>
          </View>

          <View style={[styles.barDivider, { height: sp(13) }]} />

          <Pressable
            accessibilityLabel="关节温度"
            accessibilityRole="button"
            accessibilityState={{ selected: jointTempOpen }}
            onPress={onToggleJointTemp}
            style={({ pressed }) => [
              styles.jointSwitchBtn,
              { borderRadius: sp(10), gap: sp(4), minHeight: sp(26), paddingHorizontal: sp(9), paddingVertical: sp(3) },
              jointTempOpen && styles.jointSwitchBtnActive,
              pressed && styles.pressed,
            ]}
            testID="control-hud-joint-temp-toggle"
          >
            <Ionicons color={jointTempOpen ? '#FFFFFF' : MUTED_INK} name="thermometer-outline" size={sp(13)} />
            <Text numberOfLines={1} style={[styles.jointSwitchText, { fontSize: fBody, lineHeight: fBodyLine }, jointTempOpen && styles.jointSwitchTextActive]}>关节温度</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="关节参数"
            accessibilityRole="button"
            accessibilityState={{ selected: jointParamsOpen }}
            onPress={onToggleJointParams}
            style={({ pressed }) => [
              styles.jointSwitchBtn,
              { borderRadius: sp(10), gap: sp(4), minHeight: sp(26), paddingHorizontal: sp(9), paddingVertical: sp(3) },
              jointParamsOpen && styles.jointSwitchBtnActive,
              pressed && styles.pressed,
            ]}
            testID="control-hud-joint-params-toggle"
          >
            <Ionicons color={jointParamsOpen ? '#FFFFFF' : MUTED_INK} name="analytics-outline" size={sp(13)} />
            <Text numberOfLines={1} style={[styles.jointSwitchText, { fontSize: fBody, lineHeight: fBodyLine }, jointParamsOpen && styles.jointSwitchTextActive]}>关节参数</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="运动换向"
            accessibilityRole="button"
            onPress={onReverseDirection}
            style={({ pressed }) => [
              styles.jointSwitchBtn,
              { borderRadius: sp(10), gap: sp(4), minHeight: sp(26), paddingHorizontal: sp(9), paddingVertical: sp(3) },
              pressed && styles.pressed,
            ]}
            testID="control-hud-reverse-direction"
          >
            <View
              accessible
              accessibilityLabel={forwardDirection === 'front' ? '运动正方向：前方' : '运动正方向：后方'}
              testID="control-hud-direction-arrow"
            >
              <Ionicons color={ACTIVE_EMERALD} name={forwardDirection === 'front' ? 'arrow-back' : 'arrow-forward'} size={sp(12)} />
            </View>
            <Text numberOfLines={1} style={[styles.jointSwitchText, { fontSize: fBody, lineHeight: fBodyLine }]}>换向</Text>
          </Pressable>

          <Pressable
            accessibilityLabel="收起诊断栏"
            accessibilityRole="button"
            accessibilityState={{ expanded: true }}
            onPress={onToggleExpanded}
            style={({ pressed }) => [styles.inlineCollapseBtn, { borderRadius: sp(12), height: sp(24), width: sp(24) }, pressed && styles.pressed]}
            testID="control-hud-dashboard-toggle"
          >
            <Ionicons color={INK} name="chevron-down" size={sp(14)} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedRoot: {
    alignItems: 'center',
    bottom: 6,
    gap: 4,
    left: '50%',
    position: 'absolute',
    transform: [{ translateX: -120 }],
    width: 240,
    zIndex: 4,
  },
  expandedRoot: {
    alignItems: 'center',
    bottom: 62,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 7,
  },
  expandedBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(22, 22, 22, 0.94)',
    borderColor: SURFACE_BORDER,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  expandedTelemetryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 7,
    justifyContent: 'center',
  },
  barDivider: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    height: 13,
    width: 1,
  },
  compactIndicatorsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  dualIndicatorInline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
  },
  compactEnergyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  compactEnergyTrack: {
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 2.5,
    height: 5,
    overflow: 'hidden',
    width: 38,
  },
  inlineCollapseBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    borderColor: SURFACE_BORDER,
    borderRadius: 12,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  inlineRoot: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  inlineTray: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: SURFACE_BORDER,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  inlineIconDot: {
    height: 20,
    width: 20,
  },
  inlineEnergyCol: {
    gap: 2,
    minWidth: 66,
  },
  inlineMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'space-between',
  },
  inlineRangeText: {
    color: MUTED_INK,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    lineHeight: 16,
  },
  inlineEnergyTrack: {
    flex: 0,
    width: 34,
  },
  inlineToggleOrb: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: SURFACE_BORDER,
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  toggleOrb: {
    alignItems: 'center',
    backgroundColor: SURFACE_DARK,
    borderColor: SURFACE_BORDER,
    borderRadius: 15,
    borderWidth: 1,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  collapsedTray: {
    alignItems: 'center',
    backgroundColor: SURFACE_DARK,
    borderColor: SURFACE_BORDER,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    width: 228,
  },
  sideIndicator: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  sideIndicatorActive: {
    backgroundColor: 'rgba(52, 211, 153, 0.16)',
    borderColor: ACTIVE_EMERALD,
    borderWidth: 1,
  },
  collapsedCenter: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
  },
  rangePill: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  rangeText: {
    color: INK,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 14,
  },
  collapsedEnergyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    width: '100%',
  },
  energyTrackCompact: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 3,
    flex: 1,
    height: 6,
    overflow: 'hidden',
  },
  energyFillCompact: {
    borderRadius: 3,
    height: '100%',
  },
  energyCompactText: {
    color: MUTED_INK,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 16,
  },
  dialRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
  },
  sideActionColumn: {
    alignItems: 'center',
    gap: 3,
  },
  sideRoundBtn: {
    alignItems: 'center',
    backgroundColor: SURFACE_DARK,
    borderColor: SURFACE_BORDER,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  sideActionCaption: {
    color: MUTED_INK,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  dialCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 18, 0.86)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 68,
    borderWidth: 1,
    height: 136,
    justifyContent: 'space-between',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 10,
    position: 'relative',
    width: 136,
  },
  dialCrossV: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    bottom: 8,
    left: '50%',
    position: 'absolute',
    top: 8,
    width: 1,
  },
  dialCrossH: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    height: 1,
    left: 8,
    position: 'absolute',
    right: 8,
    top: '50%',
  },
  tempSummaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    zIndex: 2,
  },
  tempSummaryText: {
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 16,
  },
  tempSummaryDivider: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    height: 9,
    width: 1,
  },
  dialMiddle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    width: '100%',
    zIndex: 2,
  },
  dualIndicatorsCol: {
    alignItems: 'center',
    gap: 6,
    paddingLeft: 2,
  },
  dualIndicatorGroup: {
    alignItems: 'center',
    gap: 2,
  },
  dualDotsRow: {
    flexDirection: 'row',
    gap: 3,
  },
  tinyDot: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: 2.5,
    height: 5,
    width: 5,
  },
  tinyDotActive: {
    backgroundColor: ACTIVE_EMERALD,
  },
  chassisCluster: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  chassisBody: {
    alignItems: 'center',
    backgroundColor: 'rgba(32, 32, 32, 0.86)',
    borderColor: 'rgba(255, 255, 255, 0.20)',
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 5,
    width: 78,
  },
  chassisEnergyRow: {
    alignItems: 'center',
    gap: 3,
    width: '100%',
  },
  chassisBatteryTrack: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 2,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  chassisBatteryFill: {
    borderRadius: 2,
    height: '100%',
  },
  chassisEnergyText: {
    color: INK,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 16,
  },
  chassisLegsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 74,
  },
  legWheel: {
    backgroundColor: 'rgba(255, 255, 255, 0.24)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 5,
    borderWidth: 1,
    height: 10,
    width: 10,
  },
  directionArrowBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.24)',
    borderRadius: 6,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 28,
  },
  dialBottomAccent: {
    backgroundColor: ACTIVE_PILL,
    borderRadius: 2,
    height: 3,
    width: 28,
  },
  jointSwitchRow: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
  },
  jointSwitchBtn: {
    alignItems: 'center',
    backgroundColor: SURFACE_DARK,
    borderColor: SURFACE_BORDER,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  jointSwitchBtnActive: {
    backgroundColor: ACTIVE_PILL,
    borderColor: 'rgba(255, 255, 255, 0.28)',
  },
  jointSwitchText: {
    color: MUTED_INK,
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 17,
  },
  jointSwitchTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  pressed: { opacity: 0.7 },
});
