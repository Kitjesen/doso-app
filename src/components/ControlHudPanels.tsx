import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { gesturePreviews } from '../assets';
import { Text } from './AppText';
import { ControlSlider } from './ControlSlider';
import type { ControlJointState } from '../features/control/controlOperations';
import {
  BODY_HEIGHT_STEP_M,
  clampBodyHeightM,
  formatBodyHeightMeters,
  HUD_GESTURE_CATEGORIES,
  HUD_LEGS,
  projectBodyHeightUi,
  projectHudGestures,
  projectJointTemperatures,
  projectLegJointParameters,
  type HudBodyHeightState,
  type HudFaultItem,
  type HudGestureCategoryId,
  type HudGestureInput,
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
          驱动器未上报温度
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

export function GestureDeckPanel({
  gestures,
  category,
  onSelectCategory,
  selectedGestureName,
  onSelectGesture,
  showGifPreview,
  onToggleGifPreview,
  gestureDisabled,
  gestureHint,
  onPlayGesture,
  variant = 'hud',
  surfaceTone = 'dark',
  deckWidth,
  maxListHeight = 168,
}: {
  gestures: readonly HudGestureInput[];
  category: HudGestureCategoryId;
  onSelectCategory: (next: HudGestureCategoryId) => void;
  selectedGestureName?: string | null;
  onSelectGesture: (name: string) => void;
  showGifPreview: boolean;
  onToggleGifPreview: () => void;
  gestureDisabled?: boolean;
  gestureHint?: string;
  onPlayGesture?: (name: string) => void;
  variant?: 'hud' | 'settings';
  surfaceTone?: 'dark' | 'light';
  deckWidth?: number;
  maxListHeight?: number;
}) {
  const projected = projectHudGestures(gestures, category, selectedGestureName);
  const selected = projected.selectedItem;
  const prefix = variant === 'hud' ? 'control-hud-gesture' : 'control-settings-gesture';
  const previewSource = selected && showGifPreview ? gesturePreviews[selected.previewKey] : undefined;
  const executeDisabled = Boolean(gestureDisabled || !selected || !onPlayGesture);
  const isSettings = variant === 'settings';
  const isLight = isSettings && surfaceTone === 'light';
  const compactHud = !isSettings && maxListHeight <= 164;

  const inspectorNode = selected ? (
    <View
      style={[
        styles.gestureInspector,
        compactHud && styles.gestureInspectorCompact,
        isSettings && styles.gestureInspectorBanner,
        isLight && styles.gestureInspectorLight,
      ]}
      testID={`${prefix}-inspector`}
    >
      {showGifPreview ? (
        <View
          style={[
            styles.gesturePreviewFrame,
            compactHud && styles.gesturePreviewFrameCompact,
            isSettings && styles.gesturePreviewFrameBanner,
            isLight && styles.gesturePreviewFrameLight,
          ]}
          testID={`${prefix}-preview-box`}
        >
          {previewSource ? (
            <Image
              accessibilityLabel={`${selected.label} 动作预览`}
              resizeMode="cover"
              source={previewSource as number}
              style={styles.gesturePreviewImage}
              testID={`${prefix}-preview-image`}
            />
          ) : (
            <View style={styles.gesturePreviewPlaceholder}>
              <Ionicons color={isLight ? '#64748B' : MUTED} name="sparkles-outline" size={18} />
              <Text style={[styles.gesturePreviewPlaceholderText, isLight && styles.gestureTextMutedLight]}>无内置预览</Text>
            </View>
          )}
          <View style={styles.gesturePreviewCornerBadge}>
            <Text style={styles.gesturePreviewCornerText}>{selected.durationText}</Text>
          </View>
        </View>
      ) : null}

      <View style={[styles.gestureInspectorRightCol, compactHud && styles.gestureInspectorRightColCompact, isSettings && styles.gestureInspectorBannerRight]}>
        <View style={styles.gestureInspectorMeta}>
          <Text numberOfLines={1} style={[styles.gestureSelectedTitle, compactHud && styles.gestureSelectedTitleCompact, isLight && styles.gestureSelectedTitleLight]}>
            {selected.label}
            {!showGifPreview ? ` · ${selected.durationText}` : ''}
          </Text>
          <Text
            numberOfLines={2}
            style={[
              styles.gestureSelectedNote,
              compactHud && styles.gestureSelectedNoteCompact,
              isLight && styles.gestureTextMutedLight,
              gestureDisabled && (isLight ? styles.gestureBlockedNoteLight : styles.gestureBlockedNote),
            ]}
          >
            {gestureDisabled && gestureHint ? gestureHint : selected.endPoseNote}
          </Text>
        </View>

        <Pressable
          accessibilityHint={executeDisabled ? gestureHint : selected.endPoseNote}
          accessibilityLabel={`执行动作 ${selected.label}`}
          accessibilityRole="button"
          accessibilityState={{ disabled: executeDisabled }}
          disabled={executeDisabled}
          onPress={() => {
            if (!executeDisabled) onPlayGesture?.(selected.name);
          }}
          style={({ pressed }) => [
            styles.gestureExecuteBtn,
            compactHud && styles.gestureExecuteBtnCompactHud,
            isSettings && styles.gestureExecuteBtnCompact,
            executeDisabled && (isLight ? styles.gestureExecuteBtnDisabledLight : styles.gestureExecuteBtnDisabled),
            pressed && !executeDisabled && styles.pressed,
          ]}
          testID={`${prefix}-execute`}
        >
          <Ionicons color={isLight && executeDisabled ? '#475569' : '#FFFFFF'} name="play" size={12} />
          <Text numberOfLines={1} style={[styles.gestureExecuteText, isLight && executeDisabled && styles.gestureExecuteTextDisabledLight]}>
            执行动作
          </Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  return (
    <View
      style={[
        styles.gestureDeckRoot,
        !isSettings && deckWidth ? { width: deckWidth } : null,
        isSettings && styles.gestureDeckSettings,
      ]}
      testID={variant === 'hud' ? 'control-hud-gesture-deck' : 'control-settings-gesture-list'}
    >
      <View style={styles.gestureTopBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.gestureCatScroll}
          style={styles.gestureCatTrack}
        >
          {HUD_GESTURE_CATEGORIES.map(cat => {
            const count = projected.categoryCounts[cat.id];
            if (cat.id !== 'all' && count === 0) return null;
            const active = category === cat.id || (projected.categoryCounts[category] === 0 && cat.id === 'all');
            return (
              <Pressable
                key={cat.id}
                accessibilityLabel={`${cat.label} (${count})`}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => onSelectCategory(cat.id)}
                style={({ pressed }) => [
                  styles.gestureCatPill,
                  isLight && !active && styles.gestureCatPillLight,
                  active && styles.gestureCatPillActive,
                  pressed && styles.pressed,
                ]}
                testID={`${prefix}-cat-${cat.id}`}
              >
                <Text numberOfLines={1} style={[styles.gestureCatText, isLight && !active && styles.gestureCatTextLight, active && styles.gestureCatTextActive]}>
                  {`${cat.label} ${count}`}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          accessibilityLabel={showGifPreview ? '关闭动作动图预览' : '开启动作动图预览'}
          accessibilityRole="switch"
          accessibilityState={{ checked: showGifPreview }}
          onPress={onToggleGifPreview}
          style={({ pressed }) => [
            styles.gestureGifToggle,
            isLight && styles.gestureGifToggleLight,
            showGifPreview && (isLight ? styles.gestureGifToggleActiveLight : styles.gestureGifToggleActive),
            pressed && styles.pressed,
          ]}
          testID={`${prefix}-gif-toggle`}
        >
          <Ionicons
            color={showGifPreview ? (isLight ? '#1D4ED8' : '#93C5FD') : (isLight ? '#475569' : MUTED)}
            name={showGifPreview ? 'play-circle' : 'play-circle-outline'}
            size={13}
          />
          <Text
            style={[
              styles.gestureGifToggleText,
              isLight && styles.gestureCatTextLight,
              showGifPreview && (isLight ? styles.gestureGifToggleTextActiveLight : styles.gestureGifToggleTextActive),
            ]}
          >
            动图
          </Text>
        </Pressable>
      </View>

      {isSettings ? (
        <View style={styles.gestureSettingsStack}>
          {inspectorNode}
          <View style={styles.gestureGridSettings}>
            {projected.filteredItems.map(item => {
              const isSelected = selected?.name === item.name;
              return (
                <Pressable
                  key={item.name}
                  accessibilityHint={gestureDisabled ? gestureHint : item.endPoseNote}
                  accessibilityLabel={`${item.label} ${item.durationText}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onSelectGesture(item.name)}
                  style={({ pressed }) => [
                    styles.gestureRowBtn,
                    styles.gestureGridCellSettings,
                    isLight && styles.gestureRowBtnLight,
                    isSelected && (isLight ? styles.gestureRowBtnSelectedLight : styles.gestureRowBtnSelected),
                    pressed && styles.pressed,
                  ]}
                  testID={`${prefix}-${item.name}`}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.gestureRowLabel,
                      isLight && styles.gestureRowLabelLight,
                      isSelected && (isLight ? styles.gestureRowLabelSelectedLight : styles.gestureRowLabelSelected),
                    ]}
                  >
                    {item.label}
                  </Text>
                  <View style={styles.gestureRowMeta}>
                    {item.cautionTag ? (
                      <View style={[styles.gestureCautionBadge, isLight && styles.gestureCautionBadgeLight]}>
                        <Text style={[styles.gestureCautionText, isLight && styles.gestureCautionTextLight]}>{item.cautionTag}</Text>
                      </View>
                    ) : null}
                    <Text style={[styles.gestureDurationText, isLight && styles.gestureTextMutedLight]}>{item.durationText}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={[styles.gestureSplitBody, { maxHeight: maxListHeight }]}>
          <ScrollView
            showsVerticalScrollIndicator
            nestedScrollEnabled
            style={[styles.gestureListScroll, { maxHeight: maxListHeight }]}
            contentContainerStyle={styles.gestureListContent}
          >
            {projected.filteredItems.map(item => {
              const isSelected = selected?.name === item.name;
              return (
                <Pressable
                  key={item.name}
                  accessibilityHint={gestureDisabled ? gestureHint : item.endPoseNote}
                  accessibilityLabel={`${item.label} ${item.durationText}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onSelectGesture(item.name)}
                  style={({ pressed }) => [
                    styles.gestureRowBtn,
                    isSelected && styles.gestureRowBtnSelected,
                    pressed && styles.pressed,
                  ]}
                  testID={`${prefix}-${item.name}`}
                >
                  <Text numberOfLines={1} style={[styles.gestureRowLabel, isSelected && styles.gestureRowLabelSelected]}>
                    {item.label}
                  </Text>
                  <View style={styles.gestureRowMeta}>
                    {item.cautionTag ? (
                      <View style={styles.gestureCautionBadge}>
                        <Text style={styles.gestureCautionText}>{item.cautionTag}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.gestureDurationText}>{item.durationText}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          {inspectorNode}
        </View>
      )}
    </View>
  );
}

export function BodyHeightPanel({
  bodyHeight,
  draftHeightM = null,
  connected,
  faulted,
  leased,
  remoteControlled = false,
  moving,
  busy = false,
  error = null,
  onToggleMode,
  onPreviewHeight,
  onCommitHeight,
  onClose,
}: {
  bodyHeight?: HudBodyHeightState | null;
  draftHeightM?: number | null;
  connected: boolean;
  faulted: boolean;
  leased: boolean;
  remoteControlled?: boolean;
  moving: boolean;
  busy?: boolean;
  error?: string | null;
  onToggleMode?: (enabled: boolean) => void;
  onPreviewHeight?: (heightM: number) => void;
  onCommitHeight?: (heightM: number) => void;
  onClose: () => void;
}) {
  const projected = projectBodyHeightUi({
    state: bodyHeight,
    draftHeightM,
    connected,
    faulted,
    leased,
    remoteControlled,
    moving,
    busy,
    hasModeCallback: typeof onToggleMode === 'function',
    hasSetCallback: typeof onCommitHeight === 'function',
  });
  const { state, bounds } = projected;
  const stepHeight = (deltaM: number) => {
    if (projected.adjustDisabled || !onCommitHeight) return;
    const nextM = clampBodyHeightM(projected.effectiveTargetM + deltaM, state);
    onCommitHeight(nextM);
  };
  const noticeText = error || projected.hint;

  return (
    <View style={[styles.panelCard, styles.heightPanelCard]} testID="control-hud-height-panel">
      <View style={styles.panelHeader}>
        <View style={styles.heightHeaderLeft}>
          <Text style={styles.panelTitle}>机身高度</Text>
          <View style={styles.heightRangeBadge} testID="control-hud-height-range">
            <Text style={styles.heightRangeText}>{bounds.rangeText}</Text>
          </View>
        </View>
        <View style={styles.heightHeaderRight}>
          <Pressable
            accessibilityLabel="高度模式"
            accessibilityRole="switch"
            accessibilityState={{ checked: state.active, disabled: projected.modeToggleDisabled, busy }}
            disabled={projected.modeToggleDisabled}
            onPress={() => {
              if (!projected.modeToggleDisabled) onToggleMode?.(!state.active);
            }}
            style={({ pressed }) => [
              styles.heightModeBtn,
              state.active && styles.heightModeBtnActive,
              projected.modeToggleDisabled && styles.heightControlDisabled,
              pressed && !projected.modeToggleDisabled && styles.pressed,
            ]}
            testID="control-hud-height-mode-toggle"
          >
            <View style={[styles.heightModeDot, state.active && styles.heightModeDotActive]} />
            <Text style={[styles.heightModeBtnText, state.active && styles.heightModeBtnTextActive]}>高度模式</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="关闭机身高度面板"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            testID="control-hud-height-close"
          >
            <Ionicons color={MUTED} name="close" size={16} />
          </Pressable>
        </View>
      </View>

      <View style={styles.heightReadoutRow}>
        <View style={styles.heightReadoutCell}>
          <Text style={styles.heightReadoutLabel}>当前</Text>
          <Text style={styles.heightReadoutValue} testID="control-hud-height-current">{projected.currentText}</Text>
        </View>
        <View style={styles.heightReadoutCell}>
          <Text style={styles.heightReadoutLabel}>目标</Text>
          <Text
            style={[styles.heightReadoutValue, state.active && styles.heightReadoutValueActive]}
            testID="control-hud-height-target"
          >
            {projected.targetText}
          </Text>
        </View>
      </View>

      <View style={styles.heightSliderRow}>
        <Pressable
          accessibilityLabel="降低机身高度"
          accessibilityRole="button"
          accessibilityState={{ disabled: projected.decDisabled }}
          disabled={projected.decDisabled}
          onPress={() => stepHeight(-BODY_HEIGHT_STEP_M)}
          style={({ pressed }) => [
            styles.heightStepBtn,
            projected.decDisabled && styles.heightControlDisabled,
            pressed && !projected.decDisabled && styles.pressed,
          ]}
          testID="control-hud-height-dec"
        >
          <Ionicons color={INK} name="remove" size={16} />
        </Pressable>

        <View style={styles.heightSliderTrackWrap}>
          <ControlSlider
            accessibilityLabel="机身高度"
            disabled={projected.adjustDisabled}
            formatValue={value => formatBodyHeightMeters(value)}
            glass
            maximumValue={bounds.maxM}
            minimumValue={bounds.minM}
            onSlidingComplete={value => {
              if (!projected.adjustDisabled) onCommitHeight?.(clampBodyHeightM(value, state));
            }}
            onValueChange={value => {
              if (!projected.adjustDisabled) onPreviewHeight?.(clampBodyHeightM(value, state));
            }}
            step={0.01}
            testID="control-hud-height-slider"
            value={projected.effectiveTargetM}
          />
        </View>

        <Pressable
          accessibilityLabel="提高机身高度"
          accessibilityRole="button"
          accessibilityState={{ disabled: projected.incDisabled }}
          disabled={projected.incDisabled}
          onPress={() => stepHeight(BODY_HEIGHT_STEP_M)}
          style={({ pressed }) => [
            styles.heightStepBtn,
            projected.incDisabled && styles.heightControlDisabled,
            pressed && !projected.incDisabled && styles.pressed,
          ]}
          testID="control-hud-height-inc"
        >
          <Ionicons color={INK} name="add" size={16} />
        </Pressable>
      </View>

      <View style={styles.heightPresetRow}>
        {bounds.presets.map(preset => {
          const selected = projected.activePresetId === preset.id;
          return (
            <Pressable
              key={preset.id}
              accessibilityLabel={`机身高度${preset.label} ${preset.valueText}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: projected.adjustDisabled, selected }}
              disabled={projected.adjustDisabled}
              onPress={() => {
                if (!projected.adjustDisabled) onCommitHeight?.(preset.valueM);
              }}
              style={({ pressed }) => [
                styles.heightPresetBtn,
                selected && styles.heightPresetBtnActive,
                projected.adjustDisabled && styles.heightControlDisabled,
                pressed && !projected.adjustDisabled && styles.pressed,
              ]}
              testID={`control-hud-height-preset-${preset.id}`}
            >
              <Text style={[styles.heightPresetLabel, selected && styles.heightPresetTextActive]}>{preset.label}</Text>
              <Text style={[styles.heightPresetValue, selected && styles.heightPresetTextActive]}>{preset.valueText}</Text>
            </Pressable>
          );
        })}
      </View>

      {noticeText ? (
        <Text
          numberOfLines={1}
          style={[styles.heightHintText, error ? styles.heightErrorText : null]}
          testID="control-hud-height-hint"
        >
          {noticeText}
        </Text>
      ) : null}
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
  gestureDeckRoot: {
    gap: 6,
    minWidth: 280,
    width: 428,
    maxWidth: '100%',
  },
  gestureDeckSettings: {
    minWidth: 0,
    width: '100%',
    paddingVertical: 4,
  },
  gestureSettingsStack: {
    gap: 8,
  },
  gestureTopBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  gestureCatTrack: {
    flex: 1,
    flexGrow: 1,
  },
  gestureCatScroll: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingRight: 4,
  },
  gestureCatPill: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 25,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  gestureCatPillActive: {
    backgroundColor: ACTIVE_BLUE,
    borderColor: '#93C5FD',
  },
  gestureCatText: {
    color: MUTED,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 14,
  },
  gestureCatTextActive: {
    color: '#FFFFFF',
  },
  gestureGifToggle: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    minHeight: 25,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gestureGifToggleActive: {
    backgroundColor: 'rgba(59, 110, 246, 0.22)',
    borderColor: 'rgba(147, 197, 253, 0.62)',
  },
  gestureGifToggleText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  gestureGifToggleTextActive: {
    color: '#DBEAFE',
  },
  gestureSplitBody: {
    flexDirection: 'row',
    gap: 8,
    maxHeight: 168,
  },
  gestureListScroll: {
    flex: 1,
    maxHeight: 168,
  },
  gestureListContent: {
    gap: 4,
    paddingRight: 2,
  },
  gestureGridSettings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gestureGridCellSettings: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 148,
  },
  gestureRowBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.09)',
    borderRadius: 9,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'space-between',
    minHeight: 30,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  gestureRowBtnSelected: {
    backgroundColor: 'rgba(59, 110, 246, 0.28)',
    borderColor: '#93C5FD',
  },
  gestureRowLabel: {
    color: INK,
    flex: 1,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  gestureRowLabelSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  gestureRowMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
  },
  gestureCautionBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.20)',
    borderColor: 'rgba(251, 191, 36, 0.50)',
    borderRadius: 5,
    borderWidth: 1,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  gestureCautionText: {
    color: '#FCD34D',
    fontSize: 9.5,
    fontWeight: '600',
    lineHeight: 12,
  },
  gestureDurationText: {
    color: MUTED,
    fontSize: 10.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    lineHeight: 13,
  },
  gestureInspector: {
    backgroundColor: 'rgba(8, 12, 16, 0.72)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 11,
    borderWidth: 1,
    flexShrink: 0,
    gap: 5,
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: 7,
    width: 162,
  },
  gestureInspectorCompact: {
    gap: 4,
    padding: 5,
    width: 156,
  },
  gestureInspectorBanner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    padding: 8,
  },
  gestureInspectorLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#CBD5E1',
  },
  gestureInspectorRightCol: {
    gap: 5,
    justifyContent: 'space-between',
  },
  gestureInspectorRightColCompact: {
    gap: 4,
  },
  gestureInspectorBannerRight: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  gesturePreviewFrame: {
    backgroundColor: '#101418',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 8,
    borderWidth: 1,
    height: 76,
    overflow: 'hidden',
    width: '100%',
  },
  gesturePreviewFrameCompact: {
    height: 58,
  },
  gesturePreviewFrameBanner: {
    height: 68,
    width: 120,
    flexShrink: 0,
  },
  gesturePreviewFrameLight: {
    backgroundColor: '#0F172A',
    borderColor: '#CBD5E1',
  },
  gesturePreviewImage: {
    height: '100%',
    width: '100%',
  },
  gesturePreviewPlaceholder: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'center',
  },
  gesturePreviewPlaceholderText: {
    color: MUTED,
    fontSize: 10,
    lineHeight: 13,
  },
  gesturePreviewCornerBadge: {
    backgroundColor: 'rgba(10, 14, 18, 0.78)',
    borderRadius: 5,
    bottom: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    position: 'absolute',
    right: 3,
  },
  gesturePreviewCornerText: {
    color: '#E2E8F0',
    fontSize: 9,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 11,
  },
  gestureInspectorMeta: {
    gap: 2,
  },
  gestureSelectedTitle: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 16,
  },
  gestureSelectedTitleCompact: {
    fontSize: 12,
    lineHeight: 15,
  },
  gestureSelectedTitleLight: {
    color: '#0F172A',
  },
  gestureSelectedNote: {
    color: MUTED,
    fontSize: 10.5,
    lineHeight: 14,
  },
  gestureSelectedNoteCompact: {
    fontSize: 10,
    lineHeight: 13,
  },
  gestureBlockedNote: {
    color: '#FBBF24',
  },
  gestureBlockedNoteLight: {
    color: '#B45309',
  },
  gestureExecuteBtn: {
    alignItems: 'center',
    backgroundColor: ACTIVE_BLUE,
    borderRadius: 8,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  gestureExecuteBtnCompactHud: {
    minHeight: 26,
    paddingVertical: 3,
  },
  gestureExecuteBtnCompact: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
  },
  gestureExecuteBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.10)',
    opacity: 0.62,
  },
  gestureExecuteBtnDisabledLight: {
    backgroundColor: '#E2E8F0',
    borderColor: '#CBD5E1',
    borderWidth: 1,
  },
  gestureExecuteText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 15,
  },
  gestureExecuteTextDisabledLight: {
    color: '#475569',
  },
  gestureCatPillLight: {
    backgroundColor: '#E8EEF5',
    borderColor: '#CBD5E1',
  },
  gestureCatTextLight: {
    color: '#475569',
  },
  gestureGifToggleLight: {
    backgroundColor: '#E8EEF5',
    borderColor: '#CBD5E1',
  },
  gestureGifToggleActiveLight: {
    backgroundColor: '#DBEAFE',
    borderColor: '#60A5FA',
  },
  gestureGifToggleTextActiveLight: {
    color: '#1D4ED8',
  },
  gestureRowBtnLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D6DEE8',
  },
  gestureRowBtnSelectedLight: {
    backgroundColor: '#EFF6FF',
    borderColor: ACTIVE_BLUE,
  },
  gestureRowLabelLight: {
    color: '#1E293B',
  },
  gestureRowLabelSelectedLight: {
    color: '#1D4ED8',
    fontWeight: '600',
  },
  gestureCautionBadgeLight: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  gestureCautionTextLight: {
    color: '#92400E',
  },
  gestureTextMutedLight: {
    color: '#475569',
  },
  heightPanelCard: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  heightHeaderLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  heightHeaderRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  heightRangeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  heightRangeText: {
    color: MUTED,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 14,
  },
  heightModeBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  heightModeBtnActive: {
    backgroundColor: ACTIVE_BLUE,
    borderColor: '#93C5FD',
  },
  heightModeDot: {
    backgroundColor: '#737B80',
    borderRadius: 3.5,
    height: 7,
    width: 7,
  },
  heightModeDotActive: {
    backgroundColor: GREEN,
  },
  heightModeBtnText: {
    color: INK,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  heightModeBtnTextActive: {
    color: '#FFFFFF',
  },
  heightReadoutRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heightReadoutCell: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  heightReadoutLabel: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  heightReadoutValue: {
    color: INK,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 19,
  },
  heightReadoutValueActive: {
    color: '#93C5FD',
  },
  heightSliderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  heightSliderTrackWrap: {
    flex: 1,
    minWidth: 0,
  },
  heightStepBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 16,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  heightPresetRow: {
    flexDirection: 'row',
    gap: 6,
  },
  heightPresetBtn: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 9,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  heightPresetBtnActive: {
    backgroundColor: ACTIVE_BLUE,
    borderColor: '#93C5FD',
  },
  heightPresetLabel: {
    color: INK,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  heightPresetValue: {
    color: MUTED,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    lineHeight: 15,
  },
  heightPresetTextActive: {
    color: '#FFFFFF',
  },
  heightControlDisabled: {
    opacity: 0.42,
  },
  heightHintText: {
    color: MUTED,
    fontSize: 11.5,
    lineHeight: 15,
    textAlign: 'center',
  },
  heightErrorText: {
    color: '#FCA5A5',
  },
  pressed: { opacity: 0.7 },
});
