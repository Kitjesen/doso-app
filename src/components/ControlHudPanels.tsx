import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from './AppText';
import { ControlSlider } from './ControlSlider';
import { getGesturePreviewAsset } from './gesturePreviewAssets';
import type { ControlJointState } from '../features/control/controlOperations';
import type { ControlAccentTone } from '../features/control/controlPreferences';
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

const PANEL_BG = 'rgba(24, 24, 24, 0.95)';
const WELL_BG = '#222222';
const TRACK_BG = '#161616';
const ACTIVE_GRAPHITE_BG = '#323232';
const ACTIVE_BLUE_BG = '#3E6AE1';
const CTA_GRAPHITE_BG = '#EAEAEA';
const CTA_GRAPHITE_INK = '#141414';
const PANEL_BORDER = 'rgba(255, 255, 255, 0.08)';
const SUBTLE_BORDER = 'rgba(255, 255, 255, 0.06)';
const INK = '#F2F2F2';
const MUTED = '#9A9A9A';
const GREEN = '#34D399';
const ORANGE = '#F59E0B';
const RED = '#EF4444';

function resolveAccent(tone: ControlAccentTone = 'graphite') {
  if (tone === 'fsdBlue') {
    return {
      pillBg: ACTIVE_BLUE_BG,
      pillBorder: 'rgba(147, 197, 253, 0.56)',
      pillInk: '#FFFFFF',
      ctaBg: ACTIVE_BLUE_BG,
      ctaInk: '#FFFFFF',
      softBg: 'rgba(62, 106, 225, 0.22)',
      highlightText: '#93C5FD',
    };
  }
  return {
    pillBg: ACTIVE_GRAPHITE_BG,
    pillBorder: 'rgba(255, 255, 255, 0.30)',
    pillInk: INK,
    ctaBg: CTA_GRAPHITE_BG,
    ctaInk: CTA_GRAPHITE_INK,
    softBg: 'rgba(255, 255, 255, 0.14)',
    highlightText: INK,
  };
}

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
  accentTone = 'graphite',
}: {
  selectedLegId: HudLegId;
  onSelectLeg: (legId: HudLegId) => void;
  joints?: readonly ControlJointState[];
  onClose: () => void;
  accentTone?: ControlAccentTone;
}) {
  const params = projectLegJointParameters(selectedLegId, joints);
  const accent = resolveAccent(accentTone);

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
                selected && { backgroundColor: accent.pillBg },
                pressed && styles.pressed,
              ]}
              testID={`control-hud-leg-tab-${leg.id}`}
            >
              <Text numberOfLines={1} style={[styles.tabText, selected && { color: accent.pillInk, fontWeight: '600' }]}>{leg.label}</Text>
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
              <Text numberOfLines={1} style={styles.paramLabel}>{item.label}：</Text>
              <Text numberOfLines={1} style={styles.paramValue}>{item.valueText}</Text>
              <View style={[styles.statusBadge, { borderColor: statusColor }]}>
                <Text numberOfLines={1} style={[styles.statusBadgeText, { color: statusColor }]}>{item.statusLabel}</Text>
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
              <Text numberOfLines={1} style={styles.tempNodeName}>{node.shortLabel}</Text>
              <Text numberOfLines={1} style={[styles.tempNodeValue, { color: tint }]}>{node.text}</Text>
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
  accentTone = 'graphite',
}: {
  moduleKind: HudJointModuleKind;
  onSelectModule: (kind: HudJointModuleKind) => void;
  joints?: readonly ControlJointState[];
  onClose: () => void;
  accentTone?: ControlAccentTone;
}) {
  const projected = projectJointTemperatures(moduleKind, joints);
  const accent = resolveAccent(accentTone);
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
                  selected && { backgroundColor: accent.pillBg },
                  pressed && styles.pressed,
                ]}
                testID={`control-hud-temp-tab-${kind}`}
              >
                <Text numberOfLines={1} style={[styles.tabText, selected && { color: accent.pillInk, fontWeight: '600' }]}>{label}</Text>
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
            <Text numberOfLines={1} style={styles.faultActionText}>查看详情</Text>
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
            <Text numberOfLines={1} style={styles.faultStopText}>软件急停</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel="关闭异常提示"
          accessibilityRole="button"
          onPress={onClose}
          style={({ pressed }) => [styles.faultActionBtn, pressed && styles.pressed]}
          testID="control-hud-fault-ack"
        >
          <Text numberOfLines={1} style={styles.faultActionText}>收起</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * 2-Column Borderless Frosted Charcoal-Graphite Action Studio:
 * Left = Blender R44 GIF Preview + Action Title + Safe Primary "执行「xxx」" CTA
 * Right = Category Filter Pills + Clean Single-Line Action Grid (NO duration seconds, NO 摔倒恢复)
 */
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
  onClose,
  variant = 'hud',
  surfaceTone = 'dark',
  accentTone = 'graphite',
  deckWidth,
  maxListHeight = 236,
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
  onClose?: () => void;
  variant?: 'hud' | 'settings';
  surfaceTone?: 'dark' | 'light';
  accentTone?: ControlAccentTone;
  deckWidth?: number;
  maxListHeight?: number;
}) {
  const projected = projectHudGestures(gestures, category, selectedGestureName);
  const selected = projected.selectedItem;
  const prefix = variant === 'hud' ? 'control-hud-gesture' : 'control-settings-gesture';
  const previewSource = selected && showGifPreview ? getGesturePreviewAsset(selected.previewKey) : undefined;
  const executeDisabled = Boolean(gestureDisabled || !selected || !onPlayGesture);
  const isSettings = variant === 'settings';
  const isLight = isSettings && surfaceTone === 'light';
  const accent = resolveAccent(accentTone);
  const stackedHud = !isSettings && typeof deckWidth === 'number' && deckWidth > 0 && deckWidth < 430;
  const compactHud = !isSettings && (maxListHeight <= 176 || (typeof deckWidth === 'number' && deckWidth > 0 && deckWidth < 500));
  const useBannerInspector = isSettings || stackedHud;
  const narrowInspectorWidth = !useBannerInspector && typeof deckWidth === 'number' && deckWidth > 0 && deckWidth < 500
    ? Math.max(148, Math.round(deckWidth * 0.34))
    : undefined;

  const inspectorNode = selected ? (
    <View
      style={[
        styles.gestureInspector,
        compactHud && styles.gestureInspectorCompact,
        narrowInspectorWidth ? { width: narrowInspectorWidth } : null,
        useBannerInspector && styles.gestureInspectorBanner,
        isLight && styles.gestureInspectorLight,
      ]}
      testID={`${prefix}-inspector`}
    >
      {showGifPreview ? (
        <View
          style={[
            styles.gesturePreviewFrame,
            compactHud && styles.gesturePreviewFrameCompact,
            !useBannerInspector && maxListHeight < 136 && styles.gesturePreviewFrameShort,
            useBannerInspector && styles.gesturePreviewFrameBanner,
            isLight && styles.gesturePreviewFrameLight,
          ]}
          testID={`${prefix}-preview-box`}
        >
          {previewSource ? (
            <Image
              accessibilityLabel={`${selected.label} 动作预览`}
              resizeMode="cover"
              source={previewSource}
              style={styles.gesturePreviewImage}
              testID={`${prefix}-preview-image`}
            />
          ) : (
            <View style={styles.gesturePreviewPlaceholder}>
              <Ionicons color={isLight ? '#6B6B6B' : MUTED} name="sparkles-outline" size={20} />
              <Text style={[styles.gesturePreviewPlaceholderText, isLight && styles.gestureTextMutedLight]}>暂无预览</Text>
            </View>
          )}
        </View>
      ) : null}

      <View style={[styles.gestureInspectorMetaCol, useBannerInspector && styles.gestureInspectorBannerRight]}>
        <View style={styles.gestureInspectorMeta}>
          <Text
            numberOfLines={1}
            style={[
              styles.gestureSelectedTitle,
              compactHud && styles.gestureSelectedTitleCompact,
              isLight && styles.gestureSelectedTitleLight,
            ]}
          >
            {selected.label}
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
          accessibilityLabel={`执行「${selected.label}」`}
          accessibilityRole="button"
          accessibilityState={{ disabled: executeDisabled }}
          disabled={executeDisabled}
          onPress={() => {
            if (!executeDisabled) onPlayGesture?.(selected.name);
          }}
          style={({ pressed }) => [
            styles.gestureExecuteBtn,
            { backgroundColor: executeDisabled ? (isLight ? '#E5E5E5' : 'rgba(255,255,255,0.08)') : accent.ctaBg },
            isSettings && styles.gestureExecuteBtnCompact,
            executeDisabled && (isLight ? styles.gestureExecuteBtnDisabledLight : styles.gestureExecuteBtnDisabled),
            pressed && !executeDisabled && styles.pressed,
          ]}
          testID={`${prefix}-execute`}
        >
          <Ionicons
            color={executeDisabled ? (isLight ? '#525252' : MUTED) : accent.ctaInk}
            name="play"
            size={12}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.gestureExecuteText,
              { color: executeDisabled ? (isLight ? '#525252' : MUTED) : accent.ctaInk },
            ]}
          >
            {`执行「${selected.label}」`}
          </Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  const categoryBar = (
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
                active && { backgroundColor: accent.pillBg, borderColor: accent.pillBorder },
                pressed && styles.pressed,
              ]}
              testID={`${prefix}-cat-${cat.id}`}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.gestureCatText,
                  isLight && !active && styles.gestureCatTextLight,
                  active && { color: accent.pillInk, fontWeight: '600' },
                ]}
              >
                {cat.label}
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
          showGifPreview && { backgroundColor: accent.softBg, borderColor: accent.pillBorder },
          pressed && styles.pressed,
        ]}
        testID={`${prefix}-gif-toggle`}
      >
        <Ionicons
          color={showGifPreview ? (isLight ? '#1F1F1F' : accent.highlightText) : (isLight ? '#525252' : MUTED)}
          name={showGifPreview ? 'play-circle' : 'play-circle-outline'}
          size={13}
        />
        <Text
          numberOfLines={1}
          style={[
            styles.gestureGifToggleText,
            isLight && styles.gestureCatTextLight,
            showGifPreview && { color: isLight ? '#1F1F1F' : accent.highlightText },
          ]}
        >
          动图
        </Text>
      </Pressable>
    </View>
  );

  return (
    <View
      style={[
        styles.gestureDeckRoot,
        !isSettings && deckWidth ? { width: deckWidth } : null,
        isSettings && styles.gestureDeckSettings,
      ]}
      testID={variant === 'hud' ? 'control-hud-gesture-deck' : 'control-settings-gesture-list'}
    >
      {!isSettings && onClose ? (
        <View style={styles.gestureModalHeader}>
          <View style={styles.gestureModalTitleRow}>
            <Text style={styles.gestureModalTitle}>动作库</Text>
            <Text style={styles.gestureModalCount}>{`${projected.allItems.length} 项`}</Text>
          </View>
          <Pressable
            accessibilityLabel="关闭动作库"
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.pressed]}
            testID="control-hud-gesture-close"
          >
            <Ionicons color={MUTED} name="close" size={16} />
          </Pressable>
        </View>
      ) : null}

      {isSettings ? (
        <View style={styles.gestureSettingsStack}>
          {categoryBar}
          {inspectorNode}
          <View style={styles.gestureGridSettings}>
            {projected.filteredItems.map(item => {
              const isSelected = selected?.name === item.name;
              return (
                <Pressable
                  key={item.name}
                  accessibilityHint={gestureDisabled ? gestureHint : item.endPoseNote}
                  accessibilityLabel={item.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => onSelectGesture(item.name)}
                  style={({ pressed }) => [
                    styles.gestureRowBtn,
                    styles.gestureGridCellSettings,
                    isLight && styles.gestureRowBtnLight,
                    isSelected && (isLight ? styles.gestureRowBtnSelectedLight : { backgroundColor: accent.pillBg, borderColor: accent.pillBorder }),
                    pressed && styles.pressed,
                  ]}
                  testID={`${prefix}-${item.name}`}
                >
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.gestureRowLabel,
                      isLight && styles.gestureRowLabelLight,
                      isSelected && (isLight ? styles.gestureRowLabelSelectedLight : { color: accent.pillInk, fontWeight: '600' }),
                    ]}
                  >
                    {item.label}
                  </Text>
                  {item.cautionTag ? (
                    <View style={[styles.gestureCautionBadge, isLight && styles.gestureCautionBadgeLight]}>
                      <Text numberOfLines={1} style={[styles.gestureCautionText, isLight && styles.gestureCautionTextLight]}>{item.cautionTag}</Text>
                    </View>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.gestureTwoColStudio,
            stackedHud && styles.gestureStackedStudio,
            { maxHeight: Math.max(148, maxListHeight + (stackedHud ? 104 : 36)) },
          ]}
        >
          {/* Left Column: GIF Studio Preview + Selected Title + Safe Primary CTA */}
          {inspectorNode}

          {/* Right Column: Category Filter Pills + Clean Single-Line Action Grid */}
          <View style={styles.gestureRightStudioCol}>
            {categoryBar}
            <ScrollView
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
              style={[styles.gestureListScroll, { maxHeight: maxListHeight }]}
              contentContainerStyle={styles.gestureGridContent}
            >
              {projected.filteredItems.map(item => {
                const isSelected = selected?.name === item.name;
                return (
                  <Pressable
                    key={item.name}
                    accessibilityHint={gestureDisabled ? gestureHint : item.endPoseNote}
                    accessibilityLabel={item.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => onSelectGesture(item.name)}
                    style={({ pressed }) => [
                      styles.gestureRowBtn,
                      styles.gestureGridCellHud,
                      isSelected && { backgroundColor: accent.pillBg, borderColor: accent.pillBorder },
                      pressed && styles.pressed,
                    ]}
                    testID={`${prefix}-${item.name}`}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.gestureRowLabel,
                        isSelected && { color: accent.pillInk, fontWeight: '600' },
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
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
  accentTone = 'graphite',
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
  accentTone?: ControlAccentTone;
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
  const accent = resolveAccent(accentTone);
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
            <Text numberOfLines={1} style={styles.heightRangeText}>{bounds.rangeText}</Text>
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
              state.active && { backgroundColor: accent.pillBg, borderColor: accent.pillBorder },
              projected.modeToggleDisabled && styles.heightControlDisabled,
              pressed && !projected.modeToggleDisabled && styles.pressed,
            ]}
            testID="control-hud-height-mode-toggle"
          >
            <View style={[styles.heightModeDot, state.active && styles.heightModeDotActive]} />
            <Text numberOfLines={1} style={[styles.heightModeBtnText, state.active && { color: accent.pillInk }]}>高度模式</Text>
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
            style={[styles.heightReadoutValue, state.active && { color: accent.highlightText }]}
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
                selected && { backgroundColor: accent.pillBg, borderColor: accent.pillBorder },
                projected.adjustDisabled && styles.heightControlDisabled,
                pressed && !projected.adjustDisabled && styles.pressed,
              ]}
              testID={`control-hud-height-preset-${preset.id}`}
            >
              <Text numberOfLines={1} style={[styles.heightPresetLabel, selected && { color: accent.pillInk, fontWeight: '600' }]}>{preset.label}</Text>
              <Text numberOfLines={1} style={[styles.heightPresetValue, selected && { color: accent.pillInk }]}>{preset.valueText}</Text>
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
    borderRadius: 18,
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  tabRow: {
    backgroundColor: TRACK_BG,
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
  tabText: {
    color: MUTED,
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 17,
  },
  paramGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  paramCell: {
    alignItems: 'center',
    backgroundColor: WELL_BG,
    borderRadius: 10,
    flexDirection: 'row',
    flexBasis: '48%',
    flexGrow: 1,
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  paramLabel: {
    color: MUTED,
    fontSize: 12,
    lineHeight: 16,
  },
  paramValue: {
    color: INK,
    flexShrink: 1,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 18,
  },
  statusBadge: {
    borderRadius: 5,
    borderWidth: 1,
    marginLeft: 'auto',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  tempControlsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  moduleSwitchGroup: {
    backgroundColor: TRACK_BG,
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
    backgroundColor: WELL_BG,
    borderColor: PANEL_BORDER,
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
    gap: 5,
    justifyContent: 'space-between',
  },
  tempNodeBadge: {
    alignItems: 'center',
    backgroundColor: TRACK_BG,
    borderRadius: 7,
    borderWidth: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    flexGrow: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 7,
    paddingVertical: 4,
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
    backgroundColor: WELL_BG,
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

  /* 2-Column Borderless Frosted Charcoal Action Studio */
  gestureDeckRoot: {
    gap: 10,
    minWidth: 260,
    width: 600,
    maxWidth: '100%',
  },
  gestureDeckSettings: {
    minWidth: 0,
    width: '100%',
    paddingVertical: 4,
  },
  gestureModalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 2,
  },
  gestureModalTitleRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
  },
  gestureModalTitle: {
    color: INK,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
  },
  gestureModalCount: {
    color: MUTED,
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
    lineHeight: 15,
  },
  gestureTwoColStudio: {
    flexDirection: 'row',
    gap: 12,
  },
  gestureStackedStudio: {
    flexDirection: 'column',
    gap: 8,
  },
  gestureRightStudioCol: {
    flex: 1,
    gap: 8,
    minWidth: 0,
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
    backgroundColor: TRACK_BG,
    borderColor: SUBTLE_BORDER,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 26,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  gestureCatText: {
    color: MUTED,
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 15,
  },
  gestureGifToggle: {
    alignItems: 'center',
    backgroundColor: TRACK_BG,
    borderColor: SUBTLE_BORDER,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    minHeight: 26,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gestureGifToggleText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  gestureListScroll: {
    flex: 1,
  },
  gestureGridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingBottom: 4,
    paddingRight: 0,
  },
  gestureGridSettings: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gestureGridCellHud: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 92,
  },
  gestureGridCellSettings: {
    flexBasis: '31%',
    flexGrow: 1,
    minWidth: 112,
  },
  gestureRowBtn: {
    alignItems: 'center',
    backgroundColor: WELL_BG,
    borderColor: SUBTLE_BORDER,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 34,
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  gestureRowLabel: {
    color: INK,
    flex: 1,
    fontSize: 12.5,
    fontWeight: '500',
    lineHeight: 17,
  },
  gestureCautionBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderColor: 'rgba(251, 191, 36, 0.40)',
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
  gestureInspector: {
    backgroundColor: WELL_BG,
    borderColor: SUBTLE_BORDER,
    borderRadius: 14,
    borderWidth: 1,
    flexShrink: 0,
    gap: 8,
    justifyContent: 'space-between',
    overflow: 'hidden',
    padding: 10,
    width: 212,
  },
  gestureInspectorCompact: {
    gap: 6,
    padding: 8,
    width: 186,
  },
  gestureInspectorBanner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    padding: 8,
    width: '100%',
  },
  gestureInspectorLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D4D4D4',
  },
  gestureInspectorMetaCol: {
    gap: 8,
    justifyContent: 'space-between',
  },
  gestureInspectorBannerRight: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  gesturePreviewFrame: {
    backgroundColor: '#161616',
    borderColor: SUBTLE_BORDER,
    borderRadius: 10,
    borderWidth: 1,
    height: 118,
    overflow: 'hidden',
    width: '100%',
  },
  gesturePreviewFrameCompact: {
    height: 92,
  },
  gesturePreviewFrameShort: {
    height: 70,
  },
  gesturePreviewFrameBanner: {
    flexShrink: 0,
    height: 68,
    width: 118,
  },
  gesturePreviewFrameLight: {
    backgroundColor: '#171717',
    borderColor: '#D4D4D4',
  },
  gesturePreviewImage: {
    height: '100%',
    width: '100%',
  },
  gesturePreviewPlaceholder: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
    justifyContent: 'center',
  },
  gesturePreviewPlaceholderText: {
    color: MUTED,
    fontSize: 10.5,
    lineHeight: 14,
  },
  gestureInspectorMeta: {
    gap: 2,
  },
  gestureSelectedTitle: {
    color: INK,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 19,
  },
  gestureSelectedTitleCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
  gestureSelectedTitleLight: {
    color: '#171717',
  },
  gestureSelectedNote: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 15,
  },
  gestureSelectedNoteCompact: {
    fontSize: 10.5,
    lineHeight: 14,
  },
  gestureBlockedNote: {
    color: MUTED,
  },
  gestureBlockedNoteLight: {
    color: '#525252',
  },
  gestureExecuteBtn: {
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  gestureExecuteBtnCompact: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
  },
  gestureExecuteBtnDisabled: {
    opacity: 0.62,
  },
  gestureExecuteBtnDisabledLight: {
    borderColor: '#D4D4D4',
    borderWidth: 1,
  },
  gestureExecuteText: {
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 17,
  },
  gestureCatPillLight: {
    backgroundColor: '#EBEBEB',
    borderColor: '#D4D4D4',
  },
  gestureCatTextLight: {
    color: '#525252',
  },
  gestureGifToggleLight: {
    backgroundColor: '#EBEBEB',
    borderColor: '#D4D4D4',
  },
  gestureRowBtnLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D9D9D9',
  },
  gestureRowBtnSelectedLight: {
    backgroundColor: '#EFEFEF',
    borderColor: '#323232',
  },
  gestureRowLabelLight: {
    color: '#1F1F1F',
  },
  gestureRowLabelSelectedLight: {
    color: '#141414',
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
    color: '#525252',
  },

  /* Body Height Popover */
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
    backgroundColor: TRACK_BG,
    borderColor: SUBTLE_BORDER,
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
    backgroundColor: WELL_BG,
    borderColor: PANEL_BORDER,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  heightModeDot: {
    backgroundColor: '#6B6B6B',
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
  heightReadoutRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heightReadoutCell: {
    alignItems: 'center',
    backgroundColor: WELL_BG,
    borderColor: SUBTLE_BORDER,
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
    backgroundColor: WELL_BG,
    borderColor: PANEL_BORDER,
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
    backgroundColor: WELL_BG,
    borderColor: SUBTLE_BORDER,
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
  heightPresetLabel: {
    color: INK,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  heightPresetValue: {
    color: MUTED,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    lineHeight: 15,
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
  pressed: {
    opacity: 0.72,
  },
});
