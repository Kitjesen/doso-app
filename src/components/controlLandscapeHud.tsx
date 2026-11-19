import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from './AppText';
import type { ControlTerrainModeId } from '../features/control/controlOperations';
import { officialDark } from '../officialPalette';

/** Official light-pill selection, not electric cyan. */
const SELECTED = officialDark.cta;
const SELECTED_INK = officialDark.ctaInk;
const FROST = 'rgba(28, 28, 27, 0.56)';
const FROST_LINE = 'rgba(232, 232, 230, 0.18)';
const STOP = '#FF3B30';
const INK = officialDark.ink;
const MUTED = officialDark.muted;
const LIVE_VOLTAGE = '#30D158';

const webBlur: ViewStyle = Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)' } as ViewStyle) : {};

/** Typical G20 landscape system-bar gutters used by the web preview (status + right nav + gesture). */
export const G20_LANDSCAPE_PREVIEW_INSETS = { top: 28, right: 48, bottom: 24, left: 24 } as const;

export type LandscapeSafeInsets = Readonly<{ top: number; right: number; bottom: number; left: number }>;

export type LandscapeTerrainOption = Readonly<{
  id: ControlTerrainModeId;
  label: string;
  disabled: boolean;
  selected: boolean;
  hint?: string;
}>;

export type LandscapePostureOption = Readonly<{
  id: 'stand' | 'sit' | 'prone' | 'recover';
  label: string;
  disabled: boolean;
  selected: boolean;
  hint?: string;
  onPress: () => void;
}>;

export type ControlLandscapeHudProps = Readonly<{
  robotName: string;
  connectionLabel: string;
  onBack: () => void;
  onOpenConnection?: () => void;
  showLocalControl: boolean;
  showUnlocked: boolean;
  terrain: readonly LandscapeTerrainOption[];
  onSelectTerrain: (id: ControlTerrainModeId) => void;
  batteryMetricLabel?: string;
  batteryLabel: string;
  batteryLive?: boolean;
  signalLabel: string;
  speedLabel: string;
  onStop: () => void;
  stopDisabled: boolean;
  stopHint?: string;
  postures: readonly LandscapePostureOption[];
  docksExpanded: boolean;
  onToggleDocks: () => void;
  onOpenSettings: () => void;
  settingsMenu?: ReactNode;
  joystick: ReactNode;
  /** Same frame as the official landscape sticks. The map window must not change it. */
  stickFrameStyle?: ViewStyle;
  onStickFrameLayout?: (event: LayoutChangeEvent) => void;
  joystickSize?: number;
  pointCloud?: ReactNode | null;
  video: ReactNode;
  feedback?: string | null;
  confirmation?: ReactNode;
  recovery?: ReactNode;
  safeInsets?: LandscapeSafeInsets;
  previewSafeAreaGuides?: boolean;
}>;

function TerrainMark({ id, color }: { id: ControlTerrainModeId; color: string }) {
  if (id === 'stairs') {
    return (
      <View style={styles.markBox}>
        <View style={[styles.step, { left: 0, height: 5, backgroundColor: color }]} />
        <View style={[styles.step, { left: 6, height: 9, backgroundColor: color }]} />
        <View style={[styles.step, { left: 12, height: 13, backgroundColor: color }]} />
      </View>
    );
  }
  if (id === 'platform') {
    return (
      <View style={styles.markBox}>
        <View style={[styles.platformBase, { backgroundColor: color }]} />
        <View style={[styles.platformTop, { backgroundColor: color }]} />
      </View>
    );
  }
  return (
    <View style={styles.markBox}>
      <View style={[styles.groundLine, { backgroundColor: color }]} />
      <View style={[styles.groundRise, { borderColor: color }]} />
    </View>
  );
}

function DogMark({ pose, color }: { pose: 'stand' | 'sit' | 'prone'; color: string }) {
  const leg = (left: number, top: number, height: number) => (
    <View key={`${pose}-${left}`} style={[styles.leg, { left, top, height, backgroundColor: color }]} />
  );
  if (pose === 'prone') {
    return (
      <View style={styles.dog}>
        <View style={[styles.body, { left: 2, top: 9, width: 15, height: 5, backgroundColor: color }]} />
        <View style={[styles.head, { left: 15, top: 7, width: 6, height: 6, backgroundColor: color }]} />
        <View style={[styles.ear, { left: 18, top: 4, backgroundColor: color }]} />
        <View style={[styles.snout, { left: 20, top: 9, width: 5, backgroundColor: color }]} />
        {leg(4, 13, 3)}
        {leg(8, 13, 3)}
        {leg(12, 13, 3)}
        {leg(16, 13, 3)}
      </View>
    );
  }
  if (pose === 'sit') {
    return (
      <View style={styles.dog}>
        <View style={[styles.body, { left: 5, top: 8, width: 10, height: 8, borderRadius: 4, backgroundColor: color }]} />
        <View style={[styles.head, { left: 13, top: 4, width: 7, height: 7, backgroundColor: color }]} />
        <View style={[styles.ear, { left: 17, top: 1, backgroundColor: color }]} />
        <View style={[styles.snout, { left: 18, top: 7, width: 5, backgroundColor: color }]} />
        {leg(7, 15, 6)}
        {leg(11, 15, 6)}
      </View>
    );
  }
  return (
    <View style={styles.dog}>
      <View style={[styles.tail, { backgroundColor: color }]} />
      <View style={[styles.body, { left: 4, top: 7, width: 13, height: 6, backgroundColor: color }]} />
      <View style={[styles.head, { left: 15, top: 4, width: 7, height: 7, backgroundColor: color }]} />
      <View style={[styles.ear, { left: 19, top: 1, backgroundColor: color }]} />
      <View style={[styles.snout, { left: 20, top: 7, width: 5, backgroundColor: color }]} />
      {leg(6, 12, 8)}
      {leg(9, 12, 8)}
      {leg(12, 12, 8)}
      {leg(15, 12, 8)}
    </View>
  );
}

function PostureMark({ id, color }: { id: LandscapePostureOption['id']; color: string }) {
  if (id === 'recover') return <Ionicons color={color} name="refresh" size={16} />;
  return <DogMark color={color} pose={id} />;
}

function Chip({ children, style, testID }: { children: ReactNode; style?: ViewStyle; testID?: string }) {
  return <View style={[styles.chip, style]} testID={testID}>{children}</View>;
}

function SafeAreaGuides({ insets }: { insets: LandscapeSafeInsets }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="control-hud-safe-guides">
      {insets.top > 0 ? <View style={[styles.guideBar, styles.guideTop, { height: insets.top }]} /> : null}
      {insets.right > 0 ? <View style={[styles.guideBar, styles.guideRight, { width: insets.right }]} /> : null}
      {insets.bottom > 0 ? <View style={[styles.guideBar, styles.guideBottom, { height: insets.bottom }]} /> : null}
      {insets.left > 0 ? <View style={[styles.guideBar, styles.guideLeft, { width: insets.left }]} /> : null}
    </View>
  );
}

export function controlLandscapeHud({
  robotName, connectionLabel, onBack, onOpenConnection, showLocalControl, showUnlocked,
  terrain, onSelectTerrain, batteryMetricLabel = '总线电压', batteryLabel, batteryLive, signalLabel, speedLabel, onStop, stopDisabled, stopHint,
  postures, docksExpanded, onToggleDocks, onOpenSettings, settingsMenu, joystick, stickFrameStyle, onStickFrameLayout,
  joystickSize, pointCloud, video, feedback, confirmation, recovery, safeInsets, previewSafeAreaGuides,
}: ControlLandscapeHudProps) {
  const visibleTerrain = terrain.filter(option => option.id !== 'platform' || !option.disabled || option.selected);
  const selectedTerrain = visibleTerrain.find(option => option.selected) ?? null;
  const selectedPosture = postures.find(option => option.selected) ?? null;
  const otherPostures = postures.filter(option => option !== selectedPosture);
  const insets = {
    top: Math.max(0, safeInsets?.top ?? 0),
    right: Math.max(0, safeInsets?.right ?? 0),
    bottom: Math.max(0, safeInsets?.bottom ?? 0),
    left: Math.max(0, safeInsets?.left ?? 0),
  };
  const metrics = [
    { id: 'battery', icon: 'flash-outline' as const, label: batteryMetricLabel, value: batteryLabel, live: Boolean(batteryLive) },
    { id: 'signal', icon: 'cellular-outline' as const, label: '信号', value: signalLabel, live: false },
    ...(speedLabel !== '—' ? [{ id: 'speed', icon: 'speedometer-outline' as const, label: '速度', value: speedLabel, live: false }] : []),
  ];
  const centerStackInset = Math.round((joystickSize || 220) + 32);

  return (
    <View style={styles.root} testID="control-landscape-hud" pointerEvents="box-none">
      <View pointerEvents="none" style={styles.backdrop} testID="control-video-backdrop" />
      {video != null && video !== false ? <View pointerEvents="none" style={styles.media} testID="control-media-stage">{video}</View> : null}
      <View pointerEvents="none" style={styles.topScrim} />
      <View pointerEvents="none" style={styles.bottomScrim} />
      {previewSafeAreaGuides ? <SafeAreaGuides insets={insets} /> : null}
      <View
        pointerEvents="box-none"
        style={[styles.safeChrome, { top: insets.top, right: insets.right, bottom: insets.bottom, left: insets.left }]}
        testID="control-landscape-safe"
      >
        <View style={styles.top} pointerEvents="box-none">
          <View style={styles.sideCluster}>
          <View style={styles.identityColumn}>
            <View style={styles.identityRow}>
              <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]} testID="control-back">
                <Ionicons color={INK} name="chevron-back" size={18} />
              </Pressable>
              <Pressable
                accessibilityLabel={`设备连接${connectionLabel}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: !onOpenConnection }}
                disabled={!onOpenConnection}
                onPress={onOpenConnection}
                style={({ pressed }) => [styles.identityChip, pressed && styles.pressed]}
                testID="control-open-connection"
              >
                <Text numberOfLines={1} style={styles.identityText}>{robotName}</Text>
                <View style={styles.connectionStatus}>
                  <View style={styles.connectionDot} />
                  <Text numberOfLines={1} style={styles.connectionText}>{connectionLabel}</Text>
                </View>
                <Ionicons color={MUTED} name="chevron-forward" size={14} />
              </Pressable>
            </View>
            {recovery}
            {showLocalControl || showUnlocked ? <View style={styles.authRow}>
              {showLocalControl ? <Chip testID="control-hud-local-control">
                <Ionicons color={MUTED} name="person-outline" size={13} />
                <Text style={styles.authText}>本设备控制</Text>
              </Chip> : null}
              {showUnlocked ? <Chip testID="control-hud-unlocked">
                <Ionicons color={MUTED} name="lock-open-outline" size={13} />
                <Text style={styles.authText}>设备已解锁</Text>
              </Chip> : null}
            </View> : null}
          </View>
          </View>
          <View style={styles.capsule} testID="control-hud-terrain-capsule">
              {visibleTerrain.map(option => (
                <Pressable
                  accessibilityHint={option.hint}
                  accessibilityLabel={`运动模式${option.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: option.disabled, selected: option.selected }}
                  disabled={option.disabled}
                  key={option.id}
                  onPress={() => onSelectTerrain(option.id)}
                  style={({ pressed }) => [styles.capsuleSegment, option.selected && styles.selectedFill, pressed && !option.disabled && styles.pressed]}
                  testID={`control-hud-terrain-capsule-${option.id}`}
                >
                  <Text style={[styles.capsuleText, option.selected && styles.selectedText]}>{option.label}</Text>
                </Pressable>
              ))}
          </View>
          <View style={[styles.sideCluster, styles.sideClusterEnd]}>
          <View style={styles.telemetryCluster}>
            <View style={styles.telemetry} testID="control-telemetry">
              {metrics.map(item => (
                <View key={item.id} style={[styles.metric, item.id === 'battery' ? styles.metricBattery : styles.metricCompact]} testID={`control-telemetry-${item.id}`}>
                  <Ionicons color={item.live ? LIVE_VOLTAGE : MUTED} name={item.icon} size={14} />
                  <Text numberOfLines={1} style={styles.metricText}>{item.label}</Text>
                  <Text numberOfLines={1} style={[styles.metricText, styles.metricValue, item.live && { color: LIVE_VOLTAGE }]}>{item.value}</Text>
                </View>
              ))}
            </View>
            <Pressable
              accessibilityHint={stopHint}
              accessibilityLabel="软件急停"
              accessibilityRole="button"
              accessibilityState={{ disabled: stopDisabled }}
              disabled={stopDisabled}
              onPress={onStop}
              style={({ pressed }) => [styles.stop, stopDisabled && styles.disabled, pressed && !stopDisabled && styles.pressed]}
              testID="control-hud-stop"
            >
              <View style={styles.stopMark} />
            </Pressable>
          </View>
          </View>
        </View>
        <View onLayout={onStickFrameLayout} pointerEvents="box-none" style={[styles.stickFrame, stickFrameStyle]} testID="control-immersive-sticks">
          {joystick}
        </View>
        <View
          pointerEvents="box-none"
          style={[styles.centerStack, { left: centerStackInset, right: centerStackInset, bottom: stickFrameStyle?.bottom }]}
          testID="control-hud-center-stack"
        >
          {pointCloud ? <View pointerEvents="box-none" style={styles.pointCloudSlot}>{pointCloud}</View> : null}
          <View pointerEvents="box-none" style={styles.dockColumn}>
            {docksExpanded ? <>
            <View style={styles.dock} testID="control-hud-posture-dock">
              {selectedPosture ? <View style={styles.leadTile} testID={`control-hud-posture-selected-${selectedPosture.id}`}>
                <PostureMark color={SELECTED_INK} id={selectedPosture.id} />
              </View> : null}
              {otherPostures.map(option => (
                <Pressable
                  accessibilityHint={option.hint}
                  accessibilityLabel={option.label}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: option.disabled, selected: false }}
                  disabled={option.disabled}
                  key={option.id}
                  onPress={option.onPress}
                  style={({ pressed }) => [styles.dockSegment, option.disabled && styles.disabled, pressed && !option.disabled && styles.pressed]}
                  testID={`control-hud-posture-${option.id}`}
                >
                  <PostureMark color={INK} id={option.id} />
                  <Text style={styles.dockText}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable accessibilityLabel="收起动作" accessibilityRole="button" accessibilityState={{ expanded: true }} onPress={onToggleDocks} style={({ pressed }) => [styles.dockToggle, pressed && styles.pressed]} testID="control-hud-docks-toggle">
              <Ionicons color={INK} name="chevron-up" size={18} />
            </Pressable>
            </> : <Pressable accessibilityLabel={`展开动作，当前${selectedTerrain?.label ?? '地形未选'}，${selectedPosture?.label ?? '姿态未选'}`} accessibilityRole="button" accessibilityState={{ expanded: false }} onPress={onToggleDocks} style={({ pressed }) => [styles.dockSummary, pressed && styles.pressed]} testID="control-hud-docks-summary">
              <Text style={styles.dockText}>{selectedTerrain?.label ?? '地形'}</Text>
              <Text style={styles.summaryDot}>·</Text>
              <Text style={styles.dockText}>{selectedPosture?.label ?? '姿态'}</Text>
              <Ionicons color={INK} name="chevron-down" size={18} />
            </Pressable>}
          </View>
        </View>
        <Pressable accessibilityLabel="设置" accessibilityRole="button" onPress={onOpenSettings} style={({ pressed }) => [styles.settings, pressed && styles.pressed]} testID="control-hud-settings">
          <Ionicons color={INK} name="settings-outline" size={18} />
          <Text style={styles.settingsText}>设置</Text>
        </Pressable>
        {settingsMenu}
        {feedback ? <View pointerEvents="none" style={styles.feedback} testID="control-operation-feedback">
          <Text numberOfLines={2} style={styles.feedbackText}>{feedback}</Text>
        </View> : null}
        {confirmation}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: officialDark.canvas, flex: 1, overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000000' },
  media: { flex: 1, height: '100%', width: '100%' },
  topScrim: { backgroundColor: 'rgba(0, 0, 0, 0.18)', height: 116, left: 0, position: 'absolute', right: 0, top: 0, zIndex: 1 },
  bottomScrim: { backgroundColor: 'rgba(0, 0, 0, 0.12)', bottom: 0, height: 132, left: 0, position: 'absolute', right: 0, zIndex: 1 },
  safeChrome: { position: 'absolute', zIndex: 2 },
  guideBar: { backgroundColor: 'rgba(0, 0, 0, 0.58)', position: 'absolute', zIndex: 8 },
  guideTop: { left: 0, right: 0, top: 0, borderBottomWidth: 1, borderBottomColor: 'rgba(240, 244, 254, 0.28)' },
  guideRight: { bottom: 0, right: 0, top: 0, borderLeftWidth: 1, borderLeftColor: 'rgba(240, 244, 254, 0.28)' },
  guideBottom: { bottom: 0, left: 0, right: 0, borderTopWidth: 1, borderTopColor: 'rgba(240, 244, 254, 0.28)' },
  guideLeft: { bottom: 0, left: 0, top: 0, borderRightWidth: 1, borderRightColor: 'rgba(240, 244, 254, 0.28)' },
  top: { alignItems: 'center', flexDirection: 'row', left: 12, position: 'absolute', right: 12, top: 10, zIndex: 4 },
  sideCluster: { flex: 1, minWidth: 0 },
  sideClusterEnd: { alignItems: 'flex-end' },
  identityColumn: { gap: 6, maxWidth: 300, zIndex: 2 },
  identityRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  back: { alignItems: 'center', backgroundColor: FROST, borderColor: FROST_LINE, borderRadius: 22, borderWidth: 1, height: 44, justifyContent: 'center', width: 44, ...webBlur },
  identityChip: { alignItems: 'center', backgroundColor: FROST, borderColor: FROST_LINE, borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 4, maxWidth: 240, minHeight: 44, paddingHorizontal: 12, ...webBlur },
  identityText: { color: INK, flexShrink: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  connectionStatus: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 4 },
  connectionDot: { backgroundColor: LIVE_VOLTAGE, borderRadius: 4, height: 7, width: 7 },
  connectionText: { color: MUTED, flexShrink: 1, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  authRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { alignItems: 'center', backgroundColor: FROST, borderColor: FROST_LINE, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 4, minHeight: 28, paddingHorizontal: 8, ...webBlur },
  authText: { color: officialDark.lede, fontSize: 12, fontWeight: '500', lineHeight: 16 },
  capsule: { backgroundColor: FROST, borderColor: FROST_LINE, borderRadius: 22, borderWidth: 1, flexDirection: 'row', flexShrink: 0, marginHorizontal: 8, minHeight: 44, padding: 4, ...webBlur },
  capsuleSegment: { alignItems: 'center', borderRadius: 18, justifyContent: 'center', minHeight: 36, minWidth: 56, paddingHorizontal: 12 },
  capsuleText: { color: INK, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  selectedFill: { backgroundColor: SELECTED },
  selectedText: { color: SELECTED_INK },
  telemetryCluster: { alignItems: 'center', alignSelf: 'stretch', flexDirection: 'row', flexShrink: 1, gap: 8, justifyContent: 'flex-end', minWidth: 0, zIndex: 2 },
  telemetry: { alignItems: 'center', flexDirection: 'row', flexGrow: 0, flexShrink: 1, gap: 6, minWidth: 0, overflow: 'hidden' },
  metric: { alignItems: 'center', backgroundColor: FROST, borderColor: FROST_LINE, borderRadius: 18, borderWidth: 1, flexDirection: 'row', flexShrink: 0, gap: 4, minHeight: 36, paddingHorizontal: 8, ...webBlur },
  metricBattery: { minWidth: 104 },
  metricCompact: { minWidth: 82 },
  metricText: { color: INK, flexShrink: 0, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  metricValue: { minWidth: 22, textAlign: 'right' },
  stop: { alignItems: 'center', backgroundColor: STOP, borderRadius: 28, flexShrink: 0, height: 56, justifyContent: 'center', width: 56 },
  stopMark: { backgroundColor: '#FFFFFF', borderRadius: 2, height: 16, width: 16 },
  stickFrame: { left: 16, position: 'absolute', right: 16, zIndex: 3 },
  centerStack: { alignItems: 'center', paddingBottom: 8, gap: 10, justifyContent: 'flex-end', position: 'absolute', top: 72, zIndex: 4 },
  pointCloudSlot: { alignSelf: 'stretch', flex: 1, minHeight: 0 },
  dockColumn: { alignItems: 'center', gap: 8, zIndex: 4 },
  dockToggle: { alignItems: 'center', backgroundColor: 'rgba(28, 28, 27, 0.42)', borderColor: FROST_LINE, borderRadius: 16, borderWidth: 1, height: 36, justifyContent: 'center', width: 48, ...webBlur },
  dockSummary: { alignItems: 'center', backgroundColor: 'rgba(28, 28, 27, 0.42)', borderColor: FROST_LINE, borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 48, paddingHorizontal: 16, ...webBlur },
  summaryDot: { color: MUTED, fontSize: 14, fontWeight: '600' },
  dock: { alignItems: 'center', backgroundColor: 'rgba(28, 28, 27, 0.42)', borderColor: FROST_LINE, borderRadius: 24, borderWidth: 1, flexDirection: 'row', gap: 2, minHeight: 52, paddingHorizontal: 4, paddingVertical: 4, ...webBlur },
  leadTile: { alignItems: 'center', backgroundColor: SELECTED, borderRadius: 16, height: 44, justifyContent: 'center', width: 44 },
  dockSegment: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
  dockText: { color: INK, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  disabled: { opacity: 0.62 },
  settings: { alignItems: 'center', backgroundColor: 'rgba(28, 28, 27, 0.78)', borderColor: FROST_LINE, borderRadius: 24, borderWidth: 1, bottom: 14, flexDirection: 'row', gap: 6, minHeight: 48, paddingHorizontal: 16, position: 'absolute', right: 14, zIndex: 4, ...webBlur },
  settingsText: { color: INK, fontSize: 15, fontWeight: '600' },
  feedback: { alignItems: 'center', backgroundColor: 'rgba(28,28,27,0.78)', borderRadius: 12, bottom: 72, left: 220, paddingHorizontal: 12, paddingVertical: 6, position: 'absolute', right: 140, zIndex: 5 },
  feedbackText: { color: INK, fontSize: 12, textAlign: 'center' },
  pressed: { opacity: 0.72 },
  markBox: { height: 14, width: 18 },
  step: { borderRadius: 1, bottom: 0, position: 'absolute', width: 5 },
  platformBase: { borderRadius: 1, bottom: 0, height: 3, left: 0, position: 'absolute', right: 0 },
  platformTop: { borderRadius: 2, bottom: 3, height: 8, left: 4, position: 'absolute', width: 10 },
  groundLine: { borderRadius: 1, bottom: 1, height: 2, left: 0, position: 'absolute', right: 0 },
  groundRise: { borderBottomWidth: 0, borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 2, bottom: 2, height: 7, left: 2, position: 'absolute', width: 14 },
  dog: { height: 22, width: 26 },
  body: { borderRadius: 3, position: 'absolute' },
  head: { borderRadius: 4, position: 'absolute' },
  ear: { borderRadius: 2, height: 4, position: 'absolute', width: 3 },
  snout: { borderRadius: 1, height: 2, position: 'absolute', width: 4 },
  tail: { borderRadius: 1, height: 2, left: 1, position: 'absolute', top: 8, transform: [{ rotate: '-24deg' }], width: 5 },
  leg: { borderRadius: 1, position: 'absolute', width: 2 },
});
