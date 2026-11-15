import { type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from './AppText';
import type { ControlTerrainModeId } from '../features/control/controlOperations';

const SELECTED = '#7EA9E8';
const SELECTED_INK = '#17354D';
const FROST = 'rgba(18, 22, 30, 0.48)';
const FROST_LINE = 'rgba(245, 248, 255, 0.22)';
const STOP = '#FF3B30';

const webBlur: ViewStyle = Platform.OS === 'web' ? ({ backdropFilter: 'blur(16px)' } as ViewStyle) : {};

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
  batteryLabel: string;
  signalLabel: string;
  speedLabel: string;
  onStop: () => void;
  stopDisabled: boolean;
  stopHint?: string;
  postures: readonly LandscapePostureOption[];
  onOpenSettings: () => void;
  settingsMenu?: ReactNode;
  joystick: ReactNode;
  /** Same frame as the official landscape sticks. The map window must not change it. */
  stickFrameStyle?: ViewStyle;
  onStickFrameLayout?: (event: LayoutChangeEvent) => void;
  /** Vertical center of the sticks inside that frame, so the docks stay aligned with them. */
  dockCenterY?: number;
  videoJoined: boolean;
  video: ReactNode;
  feedback?: string | null;
  confirmation?: ReactNode;
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
        <View style={[styles.snout, { left: 18, top: 7, backgroundColor: color }]} />
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
      <View style={[styles.snout, { left: 20, top: 7, backgroundColor: color }]} />
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

export function controlLandscapeHud({
  robotName, connectionLabel, onBack, onOpenConnection, showLocalControl, showUnlocked,
  terrain, onSelectTerrain, batteryLabel, signalLabel, speedLabel, onStop, stopDisabled, stopHint,
  postures, onOpenSettings, settingsMenu, joystick, stickFrameStyle, onStickFrameLayout, dockCenterY, videoJoined, video, feedback, confirmation,
}: ControlLandscapeHudProps) {
  const selectedTerrain = terrain.find(option => option.selected) ?? null;
  const otherTerrain = terrain.filter(option => option !== selectedTerrain);
  const selectedPosture = postures.find(option => option.selected) ?? null;
  const otherPostures = postures.filter(option => option !== selectedPosture);
  const metrics = [
    { id: 'battery', icon: 'battery-half-outline' as const, label: '电量', value: batteryLabel },
    { id: 'signal', icon: 'cellular-outline' as const, label: '信号', value: signalLabel },
    { id: 'speed', icon: 'speedometer-outline' as const, label: '速度', value: speedLabel },
  ];

  return (
    <View style={styles.root} testID="control-landscape-hud" pointerEvents="box-none">
      <View pointerEvents="none" style={styles.backdrop} testID="control-video-backdrop" />
      {videoJoined ? <View pointerEvents="none" style={styles.media} testID="control-media-stage">{video}</View> : null}
      <View style={styles.top} pointerEvents="box-none">
        <View style={styles.sideCluster}>
        <View style={styles.identityColumn}>
          <View style={styles.identityRow}>
            <Pressable accessibilityLabel="返回" accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]} testID="control-back">
              <Ionicons color="#FFFFFF" name="chevron-back" size={16} />
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
              <Text numberOfLines={1} style={styles.identityText}>{robotName} · {connectionLabel}</Text>
              <Ionicons color="rgba(255,255,255,0.85)" name="chevron-forward" size={14} />
            </Pressable>
          </View>
          {showLocalControl || showUnlocked ? <View style={styles.authRow}>
            {showLocalControl ? <Chip testID="control-hud-local-control">
              <Ionicons color="rgba(255,255,255,0.9)" name="person-outline" size={12} />
              <Text style={styles.authText}>本设备控制</Text>
            </Chip> : null}
            {showUnlocked ? <Chip testID="control-hud-unlocked">
              <Ionicons color="rgba(255,255,255,0.9)" name="lock-open-outline" size={12} />
              <Text style={styles.authText}>设备已解锁</Text>
            </Chip> : null}
          </View> : null}
        </View>
        </View>
        <View style={styles.capsule} testID="control-hud-terrain-capsule">
            {terrain.map(option => (
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
              <View key={item.id} style={styles.metric} testID={`control-telemetry-${item.id}`}>
                <Ionicons color="rgba(255,255,255,0.9)" name={item.icon} size={13} />
                <Text style={styles.metricText}>{item.label} {item.value}</Text>
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
        <View pointerEvents="box-none" style={[styles.dockColumn, dockCenterY != null && { top: dockCenterY }]}>
          <View style={styles.dock} testID="control-hud-terrain-dock">
            {selectedTerrain ? <View style={styles.leadTile} testID={`control-hud-terrain-selected-${selectedTerrain.id}`}>
              <TerrainMark color={SELECTED_INK} id={selectedTerrain.id} />
            </View> : null}
            {otherTerrain.map(option => (
              <Pressable
                accessibilityHint={option.hint}
                accessibilityLabel={`运动模式${option.label}`}
                accessibilityRole="button"
                accessibilityState={{ disabled: option.disabled, selected: false }}
                disabled={option.disabled}
                key={option.id}
                onPress={() => onSelectTerrain(option.id)}
                style={({ pressed }) => [styles.dockSegment, option.disabled && styles.disabled, pressed && !option.disabled && styles.pressed]}
                testID={`control-hud-terrain-dock-${option.id}`}
              >
                <TerrainMark color="#FFFFFF" id={option.id} />
                <Text style={styles.dockText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
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
                <PostureMark color="#FFFFFF" id={option.id} />
                <Text style={styles.dockText}>{option.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
      <Pressable accessibilityLabel="设置" accessibilityRole="button" onPress={onOpenSettings} style={({ pressed }) => [styles.settings, pressed && styles.pressed]} testID="control-hud-settings">
        <Ionicons color="#FFFFFF" name="settings-outline" size={16} />
        <Text style={styles.settingsText}>设置</Text>
      </Pressable>
      {settingsMenu}
      {feedback ? <View pointerEvents="none" style={styles.feedback} testID="control-operation-feedback">
        <Text numberOfLines={2} style={styles.feedbackText}>{feedback}</Text>
      </View> : null}
      {confirmation}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#000000', flex: 1, overflow: 'hidden' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: '#000000' },
  media: { ...StyleSheet.absoluteFill },
  top: { alignItems: 'flex-start', flexDirection: 'row', left: 12, position: 'absolute', right: 12, top: 10, zIndex: 4 },
  sideCluster: { flex: 1, minWidth: 0 },
  sideClusterEnd: { alignItems: 'flex-end' },
  identityColumn: { gap: 6, maxWidth: 280, zIndex: 2 },
  identityRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  back: { alignItems: 'center', backgroundColor: FROST, borderColor: FROST_LINE, borderRadius: 16, borderWidth: 1, height: 32, justifyContent: 'center', width: 32, ...webBlur },
  identityChip: { alignItems: 'center', backgroundColor: FROST, borderColor: FROST_LINE, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 4, maxWidth: 220, minHeight: 32, paddingHorizontal: 10, ...webBlur },
  identityText: { color: '#FFFFFF', flexShrink: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  authRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { alignItems: 'center', backgroundColor: FROST, borderColor: FROST_LINE, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 4, minHeight: 24, paddingHorizontal: 8, ...webBlur },
  authText: { color: 'rgba(255,255,255,0.92)', fontSize: 11, fontWeight: '500', lineHeight: 16 },
  capsule: { backgroundColor: FROST, borderColor: FROST_LINE, borderRadius: 18, borderWidth: 1, flexDirection: 'row', flexShrink: 0, marginHorizontal: 8, minHeight: 34, padding: 3, ...webBlur },
  capsuleSegment: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', minHeight: 28, minWidth: 48, paddingHorizontal: 8 },
  capsuleText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  selectedFill: { backgroundColor: SELECTED },
  selectedText: { color: SELECTED_INK },
  telemetryCluster: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'flex-end', zIndex: 2 },
  telemetry: { alignItems: 'center', flexDirection: 'row', flexShrink: 1, gap: 4 },
  metric: { alignItems: 'center', backgroundColor: FROST, borderColor: FROST_LINE, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 3, minHeight: 32, paddingHorizontal: 7, ...webBlur },
  metricText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', lineHeight: 16 },
  stop: { alignItems: 'center', backgroundColor: STOP, borderRadius: 21, height: 42, justifyContent: 'center', width: 42 },
  stopMark: { backgroundColor: '#FFFFFF', borderRadius: 2, height: 12, width: 12 },
  stickFrame: { left: 20, position: 'absolute', right: 20, zIndex: 3 },
  dockColumn: { alignItems: 'center', gap: 8, left: 0, marginTop: -50, position: 'absolute', right: 0, zIndex: 4 },
  dock: { alignItems: 'center', backgroundColor: 'rgba(22, 26, 34, 0.22)', borderColor: 'rgba(245,248,255,0.32)', borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 2, minHeight: 46, paddingHorizontal: 4, paddingVertical: 4, ...webBlur },
  leadTile: { alignItems: 'center', backgroundColor: SELECTED, borderRadius: 16, height: 38, justifyContent: 'center', width: 38 },
  dockSegment: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 36, paddingHorizontal: 8 },
  dockText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  disabled: { opacity: 0.62 },
  settings: { alignItems: 'center', backgroundColor: 'rgba(12, 16, 24, 0.78)', borderRadius: 22, bottom: 14, flexDirection: 'row', gap: 6, minHeight: 42, paddingHorizontal: 14, position: 'absolute', right: 14, zIndex: 4, ...webBlur },
  settingsText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  feedback: { alignItems: 'center', backgroundColor: 'rgba(12,16,24,0.72)', borderRadius: 12, bottom: 64, left: 196, paddingHorizontal: 12, paddingVertical: 6, position: 'absolute', right: 120, zIndex: 5 },
  feedbackText: { color: '#FFFFFF', fontSize: 12, textAlign: 'center' },
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
