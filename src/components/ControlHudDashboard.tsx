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

const ACTIVE_BLUE = '#3B6EF6';
const ACTIVE_CYAN = '#6ED39A';
const SURFACE_DARK = 'rgba(16, 20, 19, 0.68)';
const SURFACE_BORDER = 'rgba(232, 238, 233, 0.18)';
const MUTED_INK = '#9CA8A2';
const INK = '#F4F7F5';

function severityColor(severity: HudTemperatureSeverity | undefined): string {
  if (severity === 'protect') return '#EF4444';
  if (severity === 'warn') return '#F59E0B';
  if (severity === 'normal') return '#22C55E';
  return MUTED_INK;
}

function resolveEnergyState(batteryPercent?: number | null, voltageV?: number | null) {
  if (typeof batteryPercent === 'number' && Number.isFinite(batteryPercent) && batteryPercent >= 0 && batteryPercent <= 100) {
    const pct = Math.round(batteryPercent);
    return {
      text: `${pct}%`,
      fillRatio: pct / 100,
      live: true,
      fillColor: pct <= 20 ? '#EF4444' : pct <= 40 ? '#F59E0B' : '#22C55E',
    };
  }
  if (typeof voltageV === 'number' && Number.isFinite(voltageV) && voltageV > 0) {
    // Bus voltage normalized only visually within typical 42V-54.6V range while displaying exact Volts.
    const ratio = Math.min(1, Math.max(0.12, (voltageV - 42) / 12.6));
    return {
      text: `${voltageV.toFixed(1)}V`,
      fillRatio: ratio,
      live: true,
      fillColor: voltageV < 44 ? '#F59E0B' : '#6ED39A',
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
  const anyLightOn = headlightMode !== 'off';
  const frontLightOn = headlightMode === 'front' || headlightMode === 'both';
  const rearLightOn = headlightMode === 'both';
  const anyVideoOn = frontVideoReceiving || rearVideoReceiving;
  const energy = resolveEnergyState(batteryPercent, voltageV);
  const rangeText = typeof remainingRangeKm === 'number' && Number.isFinite(remainingRangeKm) && remainingRangeKm >= 0
    ? `${remainingRangeKm.toFixed(2)} KM`
    : '-- KM';
  const minTempText = typeof minTempC === 'number' && Number.isFinite(minTempC) ? `${Math.round(minTempC)}°C` : '--°C';
  const maxTempText = typeof maxTempC === 'number' && Number.isFinite(maxTempC) ? `${Math.round(maxTempC)}°C` : '--°C';

  if (!expanded) {
    if (inlineCollapsed) {
      const indSize = compactInline ? 18 : sp(22);
      const indIcon = compactInline ? 11 : sp(13);
      const inlineFont = compactInline ? 11 : fMeta;
      const inlineLine = compactInline ? 14 : fMetaLine;
      return (
        <View pointerEvents="box-none" style={[styles.inlineRoot, { gap: compactInline ? 4 : sp(6) }]} testID="control-hud-dashboard">
          <View style={[styles.inlineTray, { borderRadius: sp(16), gap: compactInline ? 4 : sp(6), minHeight: compactInline ? 28 : sp(32), paddingHorizontal: compactInline ? 5 : sp(8), paddingVertical: compactInline ? 3 : sp(4) }]} testID="control-hud-dashboard-collapsed">
            <View
              accessible
              accessibilityLabel={anyLightOn ? '照明灯已开启' : '照明灯关闭'}
              style={[styles.sideIndicator, { borderRadius: Math.round(indSize / 2), height: indSize, width: indSize }, anyLightOn && styles.sideIndicatorActive]}
              testID="control-hud-indicator-light"
            >
              <Ionicons color={anyLightOn ? ACTIVE_CYAN : MUTED_INK} name="flashlight-outline" size={indIcon} />
            </View>
            <View style={[styles.inlineMetaRow, { gap: compactInline ? 4 : sp(5) }]} testID="control-hud-battery-bar">
              <Text numberOfLines={1} style={[styles.inlineRangeText, { fontSize: inlineFont, lineHeight: inlineLine }]} testID="control-hud-range-readout">{rangeText}</Text>
              <View style={[styles.energyTrackCompact, styles.inlineEnergyTrack, { borderRadius: sp(3), height: compactInline ? 4 : sp(5), width: compactInline ? 22 : sp(34) }]}>
                <View style={[styles.energyFillCompact, { width: `${Math.round(energy.fillRatio * 100)}%`, backgroundColor: energy.fillColor }]} />
              </View>
              <Text numberOfLines={1} style={[styles.energyCompactText, { fontSize: inlineFont, lineHeight: inlineLine }, energy.live && { color: INK }]}>{energy.text}</Text>
            </View>
            <View
              accessible
              accessibilityLabel={anyVideoOn ? '图传接收中' : '图传未开启'}
              style={[styles.sideIndicator, { borderRadius: Math.round(indSize / 2), height: indSize, width: indSize }, anyVideoOn && styles.sideIndicatorActive]}
              testID="control-hud-indicator-video"
            >
              <Ionicons color={anyVideoOn ? ACTIVE_CYAN : MUTED_INK} name="videocam-outline" size={indIcon} />
            </View>
          </View>
          <Pressable
            accessibilityLabel="展开机器人仪表盘"
            accessibilityRole="button"
            accessibilityState={{ expanded: false }}
            onPress={onToggleExpanded}
            style={({ pressed }) => [styles.inlineToggleOrb, { borderRadius: compactInline ? 12 : sp(14), height: compactInline ? 24 : sp(28), width: compactInline ? 24 : sp(28) }, pressed && styles.pressed]}
            testID="control-hud-dashboard-toggle"
          >
            <Ionicons color={INK} name="chevron-up" size={compactInline ? 13 : sp(15)} />
          </Pressable>
        </View>
      );
    }

    return (
      <View pointerEvents="box-none" style={styles.collapsedRoot} testID="control-hud-dashboard">
        <Pressable
          accessibilityLabel="展开机器人仪表盘"
          accessibilityRole="button"
          accessibilityState={{ expanded: false }}
          onPress={onToggleExpanded}
          style={({ pressed }) => [styles.toggleOrb, pressed && styles.pressed]}
          testID="control-hud-dashboard-toggle"
        >
          <Ionicons color={INK} name="chevron-up" size={16} />
        </Pressable>
        <View style={styles.collapsedTray} testID="control-hud-dashboard-collapsed">
          <View
            accessible
            accessibilityLabel={anyLightOn ? '照明灯已开启' : '照明灯关闭'}
            style={[styles.sideIndicator, anyLightOn && styles.sideIndicatorActive]}
            testID="control-hud-indicator-light"
          >
            <Ionicons color={anyLightOn ? ACTIVE_CYAN : MUTED_INK} name="flashlight-outline" size={14} />
          </View>
          <View style={styles.collapsedCenter}>
            <View style={styles.rangePill} testID="control-hud-range-readout">
              <Text numberOfLines={1} style={styles.rangeText}>{rangeText}</Text>
            </View>
            <View style={styles.collapsedEnergyRow} testID="control-hud-battery-bar">
              <View style={styles.energyTrackCompact}>
                <View style={[styles.energyFillCompact, { width: `${Math.round(energy.fillRatio * 100)}%`, backgroundColor: energy.fillColor }]} />
              </View>
              <Text style={[styles.energyCompactText, energy.live && { color: INK }]}>{energy.text}</Text>
            </View>
          </View>
          <View
            accessible
            accessibilityLabel={anyVideoOn ? '图传接收中' : '图传未开启'}
            style={[styles.sideIndicator, anyVideoOn && styles.sideIndicatorActive]}
            testID="control-hud-indicator-video"
          >
            <Ionicons color={anyVideoOn ? ACTIVE_CYAN : MUTED_INK} name="videocam-outline" size={14} />
          </View>
        </View>
      </View>
    );
  }

  const resolvedMaxWidth = typeof maxWidth === 'number' && Number.isFinite(maxWidth) && maxWidth > 0
    ? Math.max(280, Math.min(sp(560), Math.round(maxWidth)))
    : sp(480);
  const resolvedBottom = typeof bottomOffset === 'number' && Number.isFinite(bottomOffset) && bottomOffset >= 0
    ? Math.round(bottomOffset)
    : sp(64);

  return (
    <View pointerEvents="box-none" style={[styles.expandedRoot, { bottom: resolvedBottom }]} testID="control-hud-dashboard">
      <View
        style={[
          styles.expandedBar,
          {
            borderRadius: sp(16),
            gap: sp(5),
            maxWidth: resolvedMaxWidth,
            paddingHorizontal: sp(10),
            paddingVertical: sp(6),
          },
        ]}
        testID="control-hud-dashboard-expanded"
      >
        <View style={[styles.expandedTelemetryRow, { gap: sp(7) }]} testID="control-hud-dashboard-dial">
          <View style={[styles.tempSummaryRow, { gap: sp(4) }]} testID="control-hud-temp-summary">
            <Text style={[styles.tempSummaryText, { fontSize: fMeta, lineHeight: fMetaLine, color: severityColor(minTempSeverity) }]}>{minTempText}</Text>
            <View style={[styles.tempSummaryDivider, { height: sp(9) }]} />
            <Text style={[styles.tempSummaryText, { fontSize: fMeta, lineHeight: fMetaLine, color: severityColor(maxTempSeverity) }]}>{maxTempText}</Text>
          </View>

          <View style={[styles.barDivider, { height: sp(13) }]} />

          <View style={[styles.compactIndicatorsRow, { gap: sp(6) }]}>
            <View
              accessible
              accessibilityLabel={`照明灯：前${frontLightOn ? '开' : '关'} 后${rearLightOn ? '开' : '关'}`}
              style={[styles.dualIndicatorInline, { gap: sp(3) }]}
              testID="control-hud-indicator-light"
            >
              <Ionicons color={anyLightOn ? ACTIVE_CYAN : MUTED_INK} name="flashlight-outline" size={sp(12)} />
              <View style={[styles.dualDotsRow, { gap: sp(2) }]}>
                <View style={[styles.tinyDot, { borderRadius: sp(2.5), height: sp(5), width: sp(5) }, frontLightOn && styles.tinyDotActive]} testID="control-hud-indicator-light-front" />
                <View style={[styles.tinyDot, { borderRadius: sp(2.5), height: sp(5), width: sp(5) }, rearLightOn && styles.tinyDotActive]} testID="control-hud-indicator-light-rear" />
              </View>
            </View>
            <View
              accessible
              accessibilityLabel={`图传：前${frontVideoReceiving ? '开' : '关'} 后${rearVideoReceiving ? '开' : '关'}`}
              style={[styles.dualIndicatorInline, { gap: sp(3) }]}
              testID="control-hud-indicator-video"
            >
              <Ionicons color={anyVideoOn ? ACTIVE_CYAN : MUTED_INK} name="videocam-outline" size={sp(12)} />
              <View style={[styles.dualDotsRow, { gap: sp(2) }]}>
                <View style={[styles.tinyDot, { borderRadius: sp(2.5), height: sp(5), width: sp(5) }, frontVideoReceiving && styles.tinyDotActive]} testID="control-hud-indicator-video-front" />
                <View style={[styles.tinyDot, { borderRadius: sp(2.5), height: sp(5), width: sp(5) }, rearVideoReceiving && styles.tinyDotActive]} testID="control-hud-indicator-video-rear" />
              </View>
            </View>
          </View>

          <View style={[styles.barDivider, { height: sp(13) }]} />

          <View style={[styles.compactEnergyRow, { gap: sp(5) }]} testID="control-hud-battery-bar">
            <View style={[styles.compactEnergyTrack, { borderRadius: sp(2.5), height: sp(5), width: sp(38) }]}>
              <View style={[styles.chassisBatteryFill, { width: `${Math.round(energy.fillRatio * 100)}%`, backgroundColor: energy.fillColor }]} />
            </View>
            <Text numberOfLines={1} style={[styles.chassisEnergyText, { fontSize: fMeta, lineHeight: fMetaLine }]}>{energy.text}</Text>
          </View>

          <View
            accessible
            accessibilityLabel={forwardDirection === 'front' ? '运动正方向：前方' : '运动正方向：后方'}
            style={[styles.directionArrowBox, { borderRadius: sp(6), height: sp(20), width: sp(24) }]}
            testID="control-hud-direction-arrow"
          >
            <Ionicons
              color={ACTIVE_CYAN}
              name={forwardDirection === 'front' ? 'arrow-back' : 'arrow-forward'}
              size={sp(13)}
            />
          </View>

          <Pressable
            accessibilityLabel="收起机器人仪表盘"
            accessibilityRole="button"
            accessibilityState={{ expanded: true }}
            onPress={onToggleExpanded}
            style={({ pressed }) => [styles.inlineCollapseBtn, { borderRadius: sp(12), height: sp(24), width: sp(24) }, pressed && styles.pressed]}
            testID="control-hud-dashboard-toggle"
          >
            <Ionicons color={INK} name="chevron-down" size={sp(14)} />
          </Pressable>
        </View>

        <View pointerEvents="box-none" style={[styles.jointSwitchRow, { gap: sp(6) }]}>
          <Pressable
            accessibilityLabel="自主充电"
            accessibilityRole="button"
            onPress={onChargePress}
            style={({ pressed }) => [
              styles.jointSwitchBtn,
              { borderRadius: sp(12), gap: sp(4), minHeight: sp(26), paddingHorizontal: sp(9), paddingVertical: sp(3) },
              pressed && styles.pressed,
            ]}
            testID="control-hud-charge"
          >
            <Ionicons color={MUTED_INK} name="battery-charging-outline" size={sp(13)} />
            <Text numberOfLines={1} style={[styles.jointSwitchText, { fontSize: fBody, lineHeight: fBodyLine }]}>充电</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="运动换向"
            accessibilityRole="button"
            onPress={onReverseDirection}
            style={({ pressed }) => [
              styles.jointSwitchBtn,
              { borderRadius: sp(12), gap: sp(4), minHeight: sp(26), paddingHorizontal: sp(9), paddingVertical: sp(3) },
              pressed && styles.pressed,
            ]}
            testID="control-hud-reverse-direction"
          >
            <Ionicons color={MUTED_INK} name="swap-horizontal-outline" size={sp(13)} />
            <Text numberOfLines={1} style={[styles.jointSwitchText, { fontSize: fBody, lineHeight: fBodyLine }]}>换向</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="关节温度"
            accessibilityRole="button"
            accessibilityState={{ selected: jointTempOpen }}
            onPress={onToggleJointTemp}
            style={({ pressed }) => [
              styles.jointSwitchBtn,
              { borderRadius: sp(12), gap: sp(4), minHeight: sp(26), paddingHorizontal: sp(9), paddingVertical: sp(3) },
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
              { borderRadius: sp(12), gap: sp(4), minHeight: sp(26), paddingHorizontal: sp(9), paddingVertical: sp(3) },
              jointParamsOpen && styles.jointSwitchBtnActive,
              pressed && styles.pressed,
            ]}
            testID="control-hud-joint-params-toggle"
          >
            <Ionicons color={jointParamsOpen ? '#FFFFFF' : MUTED_INK} name="analytics-outline" size={sp(13)} />
            <Text numberOfLines={1} style={[styles.jointSwitchText, { fontSize: fBody, lineHeight: fBodyLine }, jointParamsOpen && styles.jointSwitchTextActive]}>关节参数</Text>
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
    backgroundColor: 'rgba(16, 20, 23, 0.86)',
    borderColor: SURFACE_BORDER,
    borderRadius: 16,
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
    backgroundColor: 'rgba(59, 110, 246, 0.28)',
    borderColor: ACTIVE_CYAN,
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
    backgroundColor: 'rgba(14, 18, 17, 0.82)',
    borderColor: 'rgba(232, 238, 233, 0.20)',
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
    backgroundColor: ACTIVE_CYAN,
  },
  chassisCluster: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  chassisBody: {
    alignItems: 'center',
    backgroundColor: 'rgba(30, 38, 36, 0.82)',
    borderColor: 'rgba(232, 238, 233, 0.26)',
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
    backgroundColor: 'rgba(59, 110, 246, 0.25)',
    borderColor: ACTIVE_CYAN,
    borderRadius: 6,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 28,
  },
  dialBottomAccent: {
    backgroundColor: ACTIVE_BLUE,
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
    backgroundColor: ACTIVE_BLUE,
    borderColor: ACTIVE_CYAN,
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
