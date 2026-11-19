import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { getProductAppearance } from '../appearance';
import { useAppTheme } from '../theme';
import { typography } from '../typography';
import { Text } from './AppText';

type Props = { map: ReactNode; summary: ReactNode; children: ReactNode; label?: string };
const webHandle = Platform.OS === 'web' ? { cursor: 'pointer', touchAction: 'none' } as const : undefined;

export function TrackSheet({ map, summary, children, label = '轨迹摘要' }: Props) {
  const collapsed = label === '轨迹摘要' ? 196 : 177;
  const { height: windowHeight } = useWindowDimensions();
  const { isDark } = useAppTheme(), appearance = getProductAppearance(isDark);
  const stageHeight = Math.max(500, Math.min(label === '轨迹摘要' ? 600 : 621, windowHeight - (label === '轨迹摘要' ? 260 : 223)));
  const expanded = Math.min(340, stageHeight - 260);
  const [open, setOpen] = useState(false);
  const openRef = useRef(false);
  const dragPress = useRef(false);
  const [dragging, setDragging] = useState(false);
  const height = useRef(new Animated.Value(collapsed)).current;
  const start = useRef(collapsed);
  const reduced = useRef(true);
  useEffect(() => {
    let active = true, changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', value => { changed = true; reduced.current = value; if (value) { height.stopAnimation(); height.setValue(openRef.current ? expanded : collapsed); } });
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active && !changed) reduced.current = value; }, () => {});
    return () => { active = false; subscription.remove(); };
  }, [expanded, height]);
  const snap = (next: boolean) => {
    openRef.current = next;
    setOpen(next);
    Animated.timing(height, { toValue: next ? expanded : collapsed, duration: reduced.current ? 0 : 180, useNativeDriver: false }).start();
  };
  useEffect(() => {
    height.stopAnimation();
    height.setValue(open ? expanded : collapsed);
    return () => height.stopAnimation();
  }, [expanded, height]);
  // Keep the active gesture stable when snapping updates the rendered state.
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
    onPanResponderGrant: () => {
      dragPress.current = Platform.OS === 'web';
      setDragging(true);
      height.stopAnimation(value => { start.current = value; });
    },
    onPanResponderMove: (_event, gesture) => height.setValue(Math.max(collapsed, Math.min(expanded, start.current - gesture.dy))),
    onPanResponderRelease: (_event, gesture) => {
      const next = gesture.vy < -0.25 || gesture.vy <= 0.25 && start.current - gesture.dy > (collapsed + expanded) / 2;
      snap(next);
      setDragging(false);
    },
    onPanResponderTerminate: () => { snap(openRef.current); setDragging(false); },
    onPanResponderTerminationRequest: () => false,
  }), [expanded, height]);

  return <View style={[styles.stage, { height: stageHeight }]} testID="track-stage">
    <View style={styles.map} pointerEvents={dragging ? 'none' : 'auto'} testID="track-map-viewport">{map}</View>
    <Animated.View style={[styles.sheet, label !== '轨迹摘要' && { marginTop: 12 }, { height, backgroundColor: appearance.raised, borderColor: appearance.border }]} testID="track-sheet">
      <View {...pan.panHandlers} style={webHandle} testID="track-sheet-drag">
        <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint="向上拖动展开，向下拖动收起，也可点击切换"
          aria-expanded={open} accessibilityState={{ expanded: open }} onPressIn={() => { dragPress.current = false; }}
          onPress={event => {
            // RNW View drops PanResponder's click-capture handler after a drag.
            const detail = (event.nativeEvent as { detail?: number }).detail;
            const skip = dragPress.current && detail !== 0;
            dragPress.current = false;
            if (!skip) snap(!openRef.current);
          }} style={[styles.handle, label !== '轨迹摘要' && { height: 28 }]} testID="track-sheet-handle">
          <View style={[styles.grip, { backgroundColor: appearance.border }]} />
          {label === '轨迹摘要' ? <Text style={[typography.caption, { color: appearance.secondary }]}>{open ? '下拉收起详情' : '上拉查看详情'}</Text> : null}
        </Pressable>
      </View>
      {summary}
      <Animated.View style={[styles.details, { opacity: height.interpolate({ inputRange: [collapsed, collapsed + 16], outputRange: [0, 1], extrapolate: 'clamp' }) }]}
        aria-hidden={!open} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'} pointerEvents={open ? 'auto' : 'none'} testID="track-details">
        <ScrollView style={styles.details} contentContainerStyle={styles.detailContent} nestedScrollEnabled scrollEnabled={open}>{children}</ScrollView>
      </Animated.View>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  stage: { overflow: 'hidden' }, map: { flex: 1, minHeight: 0 },
  sheet: { borderTopLeftRadius: 12, borderTopRightRadius: 12, borderTopWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  handle: { height: 44, alignItems: 'center', justifyContent: 'center', gap: 3 }, grip: { width: 32, height: 4, borderRadius: 2 },
  details: { flex: 1, minHeight: 0 }, detailContent: { paddingHorizontal: 18, paddingTop: 4, paddingBottom: 18, gap: 10 },
});
