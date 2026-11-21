import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from './AppText';
import type { ControlJointState } from '../features/control/controlOperations';
import {
  HUD_LEGS,
  projectJointTemperatures,
  projectLegJointParameters,
  type HudFaultItem,
  type HudJointModuleKind,
  type HudLegId,
  type HudLegTemperatureGroup,
  type HudTemperatureSeverity,
} from './controlHudModel';

const ACTIVE_BLUE = '#3B6EF6';
const PANEL_BG = 'rgba(16, 20, 24, 0.92)';
const PANEL_BORDER = 'rgba(255, 255, 255, 0.16)';
const INK = '#F4F7FB';
const MUTED = '#9AA4B2';
const GREEN = '#22C55E';
const ORANGE = '#F59E0B';
const RED = '#EF4444';

function tempTint(severity: HudTemperatureSeverity): string {
  if (severity === 'protect') return RED;
  if (severity === 'warn') return ORANGE;
  if (severity === 'normal') return GREEN;
  return MUTED;
}

export function JointParametersPanel({
  selectedLegId,
  onSelectLeg,
  joints,
  onClose,
}: {
  selectedLegId: HudLegId;
  onSelectLeg: (legId: HudLegId) => void;
  joints?: readonly ControlJointState[];
  onClose: () => void;
}) {
  const params = projectLegJointParameters(selectedLegId, joints);

  return (
    <View style={styles.panelCard} testID="control-hud-joint-params-panel">
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>关节参数</Text>
        <Pressable
          accessibilityLabel="关闭关节参数面板"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          testID="control-hud-joint-params-close"
        >
          <Ionicons color={MUTED} name="close" size={16} />
        </Pressable>
      </View>

      <View style={styles.tabRow}>
        {HUD_LEGS.map(leg => {
          const selected = leg.id === selectedLegId;
          return (
            <Pressable
              key={leg.id}
              accessibilityLabel={leg.label}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => onSelectLeg(leg.id)}
              style={({ pressed }) => [
                styles.tabPill,
                selected && styles.tabPillActive,
                pressed && styles.pressed,
              ]}
              testID={`control-hud-leg-tab-${leg.id}`}
            >
              <Text style={[styles.tabText, selected && styles.tabTextActive]}>{leg.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.paramGrid}>
        {params.map(item => {
          const statusColor = item.status === 'normal'
            ? GREEN
            : item.status === 'fault'
              ? RED
              : MUTED;
          return (
            <View key={item.id} style={styles.paramCell} testID={`control-hud-joint-param-${item.id}`}>
              <Text style={styles.paramLabel}>{item.label}：</Text>
              <Text numberOfLines={1} style={styles.paramValue}>{item.valueText}</Text>
              <View style={[styles.statusBadge, { borderColor: statusColor }]}>
                <Text style={[styles.statusBadgeText, { color: statusColor }]}>{item.statusLabel}</Text>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function LegTempCluster({ group }: { group: HudLegTemperatureGroup }) {
  return (
    <View style={styles.legTempCluster} testID={`control-hud-temp-leg-${group.id}`}>
      <Text style={styles.legClusterLabel}>{group.shortLabel}</Text>
      <View style={styles.legTempNodes}>
        {group.nodes.map(node => {
          const tint = tempTint(node.severity);
          return (
            <View
              key={node.id}
              accessible
              accessibilityLabel={`${group.label}${node.label} ${node.text}`}
              style={[styles.tempNodeBadge, { borderColor: tint }]}
              testID={`control-hud-joint-temp-${node.id}`}
            >
              <Text style={styles.tempNodeName}>{node.shortLabel}</Text>
              <Text style={[styles.tempNodeValue, { color: tint }]}>{node.text}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function JointTemperaturePanel({
  moduleKind,
  onSelectModule,
  joints,
  onClose,
}: {
  moduleKind: HudJointModuleKind;
  onSelectModule: (kind: HudJointModuleKind) => void;
  joints?: readonly ControlJointState[];
  onClose: () => void;
}) {
  const projected = projectJointTemperatures(moduleKind, joints);
  const frontLeft = projected.groups.find(g => g.id === 'front-left')!;
  const frontRight = projected.groups.find(g => g.id === 'front-right')!;
  const rearLeft = projected.groups.find(g => g.id === 'rear-left')!;
  const rearRight = projected.groups.find(g => g.id === 'rear-right')!;

  return (
    <View style={styles.panelCard} testID="control-hud-joint-temp-panel">
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>关节温度</Text>
        <Pressable
          accessibilityLabel="关闭关节温度面板"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          testID="control-hud-joint-temp-close"
        >
          <Ionicons color={MUTED} name="close" size={16} />
        </Pressable>
      </View>

      <View style={styles.tempControlsRow}>
        <View style={styles.moduleSwitchGroup}>
          {([
            ['motor', '电机'],
            ['driver', '驱动器'],
          ] as const).map(([kind, label]) => {
            const selected = moduleKind === kind;
            return (
              <Pressable
                key={kind}
                accessibilityLabel={label}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                onPress={() => onSelectModule(kind)}
                style={({ pressed }) => [
                  styles.moduleBtn,
                  selected && styles.tabPillActive,
                  pressed && styles.pressed,
                ]}
                testID={`control-hud-temp-tab-${kind}`}
              >
                <Text style={[styles.tabText, selected && styles.tabTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.legendRow} testID="control-hud-temp-legend">
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: GREEN }]} />
            <Text style={styles.legendText}>正常</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: ORANGE }]} />
            <Text style={styles.legendText}>预警</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: RED }]} />
            <Text style={styles.legendText}>保护</Text>
          </View>
        </View>
      </View>

      <View style={styles.chassisMap}>
        <View style={styles.chassisSideColumn}>
          {LegTempCluster({ group: frontLeft })}
          {LegTempCluster({ group: rearLeft })}
        </View>
        <View style={styles.chassisCoreBox}>
          <Text style={styles.chassisDirectionHint}>前</Text>
          <Text style={styles.chassisBrandText}>DOSO</Text>
          <Text style={styles.chassisDirectionHint}>后</Text>
        </View>
        <View style={styles.chassisSideColumn}>
          {LegTempCluster({ group: frontRight })}
          {LegTempCluster({ group: rearRight })}
        </View>
      </View>

      {moduleKind === 'driver' && !projected.driverReported ? (
        <Text style={styles.truthfulNote} testID="control-hud-driver-temp-note">
          当前固件未上报驱动器温度，驱动器测温待接入
        </Text>
      ) : null}
    </View>
  );
}

export function FaultListPanel({
  faults,
  onClose,
  onOpenJointStatus,
  onStop,
  stopDisabled,
}: {
  faults: readonly HudFaultItem[];
  onClose: () => void;
  onOpenJointStatus?: () => void;
  onStop: () => void;
  stopDisabled: boolean;
}) {
  return (
    <View style={[styles.panelCard, styles.faultPanel]} testID="control-hud-fault-panel">
      <View style={styles.panelHeader}>
        <View style={styles.faultHeaderTitleRow}>
          <Ionicons color={RED} name="alert-circle" size={16} />
          <Text style={styles.panelTitle}>异常列表 ({faults.length})</Text>
        </View>
        <Pressable
          accessibilityLabel="关闭异常列表"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
          testID="control-hud-fault-panel-close"
        >
          <Ionicons color={MUTED} name="close" size={16} />
        </Pressable>
      </View>

      <ScrollView style={styles.faultListScroll} contentContainerStyle={styles.faultListContent} showsVerticalScrollIndicator={false}>
        {faults.map(item => (
          <View
            key={item.id}
            style={[styles.faultRow, item.severity === 'critical' ? styles.faultRowCritical : styles.faultRowWarning]}
            testID={`control-hud-fault-item-${item.id}`}
          >
            <Text style={styles.faultItemTitle}>{item.title}</Text>
            <Text style={styles.faultItemDetail}>{item.detail}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.faultActionsRow}>
        {onOpenJointStatus ? (
          <Pressable
            accessibilityLabel="查看机器人状态详情"
            accessibilityRole="button"
            onPress={() => { onClose(); onOpenJointStatus(); }}
            style={({ pressed }) => [styles.faultActionBtn, pressed && styles.pressed]}
            testID="control-hud-fault-open-status"
          >
            <Text style={styles.faultActionText}>查看详情</Text>
          </Pressable>
        ) : null}
        {!stopDisabled ? (
          <Pressable
            accessibilityLabel="执行软件急停"
            accessibilityRole="button"
            onPress={() => { onClose(); onStop(); }}
            style={({ pressed }) => [styles.faultActionBtn, styles.faultStopBtn, pressed && styles.pressed]}
            testID="control-hud-fault-stop"
          >
            <Text style={styles.faultStopText}>软件急停</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="关闭异常提示"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.faultActionBtn, pressed && styles.pressed]}
          testID="control-hud-fault-ack"
        >
          <Text style={styles.faultActionText}>收起</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panelCard: {
    backgroundColor: PANEL_BG,
    borderColor: PANEL_BORDER,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    width: '100%',
  },
  faultPanel: {
    maxHeight: 260,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  faultHeaderTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  panelTitle: {
    color: INK,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  closeBtn: {
    alignItems: 'center',
    borderRadius: 12,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  tabRow: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 4,
    padding: 3,
  },
  tabPill: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tabPillActive: {
    backgroundColor: ACTIVE_BLUE,
  },
  tabText: {
    color: MUTED,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  paramGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  paramCell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    flexDirection: 'row',
    flexBasis: '48%',
    flexGrow: 1,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  paramLabel: {
    color: MUTED,
    fontSize: 12.5,
    lineHeight: 17,
  },
  paramValue: {
    color: INK,
    flexShrink: 1,
    fontSize: 13.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 18,
  },
  statusBadge: {
    borderRadius: 4,
    borderWidth: 1,
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 15,
  },
  tempControlsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  moduleSwitchGroup: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 3,
    padding: 2,
  },
  moduleBtn: {
    alignItems: 'center',
    borderRadius: 7,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  legendRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  legendItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  legendDot: {
    borderRadius: 3.5,
    height: 7,
    width: 7,
  },
  legendText: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 16,
  },
  chassisMap: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  chassisSideColumn: {
    flex: 1,
    gap: 8,
  },
  chassisCoreBox: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    justifyContent: 'space-between',
    paddingVertical: 10,
    width: 64,
  },
  chassisDirectionHint: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 14,
  },
  chassisBrandText: {
    color: INK,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    lineHeight: 16,
  },
  legTempCluster: {
    gap: 4,
  },
  legClusterLabel: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  legTempNodes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  tempNodeBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  tempNodeName: {
    color: MUTED,
    fontSize: 11.5,
    lineHeight: 15,
  },
  tempNodeValue: {
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 16,
  },
  truthfulNote: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
  },
  faultListScroll: {
    maxHeight: 144,
  },
  faultListContent: {
    gap: 6,
  },
  faultRow: {
    borderRadius: 8,
    borderLeftWidth: 3,
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  faultRowCritical: {
    backgroundColor: 'rgba(239, 68, 68, 0.14)',
    borderLeftColor: RED,
  },
  faultRowWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderLeftColor: ORANGE,
  },
  faultItemTitle: {
    color: INK,
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  faultItemDetail: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 17,
  },
  faultActionsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  faultActionBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 8,
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  faultActionText: {
    color: INK,
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  faultStopBtn: {
    backgroundColor: RED,
  },
  faultStopText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  pressed: { opacity: 0.7 },
});
