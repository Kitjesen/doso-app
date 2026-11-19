import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { Text } from './AppText';

const MIN_SIZE = 96;
const MAX_SIZE = 260;

function snapshotUrl(host: string | null) {
  if (!host) return null;
  const normalized = host.trim().replace(/^\[|\]$/g, '');
  if (!normalized || /[^0-9a-f:.]/i.test(normalized)) return null;
  const authority = normalized.includes(':') ? `[${normalized}]` : normalized;
  return `http://${authority}:5050/api/v1/camera/depth/snapshot`;
}

function DepthPreview({ endpoint }: { endpoint: string }) {
  const [request, setRequest] = useState<{ nonce: number; pending: boolean; status: 'loading' | 'ready' | 'error' }>(
    () => ({ nonce: Date.now(), pending: true, status: 'loading' }),
  );
  const { nonce, pending, status } = request;
  const complete = (result: 'ready' | 'error') => {
    setRequest(current => current.nonce === nonce && current.pending
      ? { ...current, pending: false, status: result }
      : current);
  };
  useEffect(() => {
    const timer = pending
      ? setTimeout(() => complete('error'), 3000)
      : setTimeout(() => setRequest(current => ({
        ...current,
        nonce: Math.max(Date.now(), current.nonce + 1),
        pending: true,
      })), 1000);
    return () => clearTimeout(timer);
  }, [nonce, pending]);

  return <>
    <Image
      testID="depth-image"
      accessible={false}
      source={{ uri: `${endpoint}?ts=${nonce}` }}
      resizeMode="contain"
      style={[StyleSheet.absoluteFill, status !== 'ready' && styles.hidden]}
      onLoad={() => complete('ready')}
      onError={() => complete('error')}
    />
    <Text style={styles.status}>{status === 'ready' ? '机器狗实时源' : status === 'error' ? '深度图暂不可用' : '正在读取'}</Text>
  </>;
}

export function DepthSnapshotView({ host, active, size = 124 }: {
  host: string | null;
  active: boolean;
  size?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [resizing, setResizing] = useState(false);
  const [requestedSize, setRequestedSize] = useState(size);
  const [available, setAvailable] = useState({ width: MAX_SIZE, height: MAX_SIZE });
  const limit = Math.max(MIN_SIZE, Math.floor(Math.min(MAX_SIZE, available.width, available.height)));
  const frameSize = clampSize(requestedSize, limit);
  const canResize = expanded && active && resizing && limit > MIN_SIZE;
  const resizeDisabled = !resizing && (!active || limit === MIN_SIZE);
  const resize = useRef({ allowed: canResize, frameSize, limit });
  resize.current = { allowed: canResize, frameSize, limit };
  const dragStart = useRef<number | null>(null);
  const endpoint = snapshotUrl(host);

  const resizePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => resize.current.allowed,
    onPanResponderGrant: () => { dragStart.current = resize.current.frameSize; },
    onPanResponderMove: (_, gesture) => {
      if (!resize.current.allowed || dragStart.current === null) return;
      // The centered card grows upward from its fixed bottom edge.
      const delta = Math.abs(gesture.dx) >= Math.abs(gesture.dy) ? gesture.dx * 2 : -gesture.dy;
      setRequestedSize(clampSize(dragStart.current + delta, resize.current.limit));
    },
    onPanResponderRelease: () => { dragStart.current = null; },
    onPanResponderTerminate: () => { dragStart.current = null; },
  }), []);

  const close = () => {
    dragStart.current = null;
    setResizing(false);
    setExpanded(false);
  };

  return <View pointerEvents="box-none" style={styles.slot} onLayout={({ nativeEvent: { layout } }) => {
    const { width, height } = layout;
    setAvailable(current => current.width === width && current.height === height ? current : { width, height });
  }}>
    {!expanded ? <Pressable accessibilityLabel="展开深度图" accessibilityRole="button" accessibilityState={{ expanded: false }}
      onPress={() => setExpanded(true)} style={styles.collapsed} testID="control-hud-depth-collapsed">
      <Text style={styles.controlText}>深度图</Text>
      <Ionicons name="chevron-up" size={14} color="#F6F7F8" />
    </Pressable> : <View style={[styles.frame, {
      height: Math.max(47, Math.min(frameSize, available.height)),
      width: frameSize,
    }]} testID="control-hud-depth">
      <View style={styles.preview}>
        {active && endpoint ? <DepthPreview key={endpoint} endpoint={endpoint} />
          : <Text style={styles.status}>{active ? '深度图暂不可用' : '已暂停'}</Text>}
        {canResize ? <View accessible accessibilityLabel="调整深度图大小" accessibilityRole="adjustable"
          accessibilityValue={{ min: MIN_SIZE, max: limit, now: frameSize }}
          accessibilityActions={[{ name: 'increment', label: '放大' }, { name: 'decrement', label: '缩小' }]}
          onAccessibilityAction={({ nativeEvent: { actionName } }) => {
            if (!resize.current.allowed) return;
            if (actionName === 'increment') setRequestedSize(current => clampSize(clampSize(current, limit) + 16, limit));
            if (actionName === 'decrement') setRequestedSize(current => clampSize(clampSize(current, limit) - 16, limit));
          }}
          {...resizePanResponder.panHandlers} style={styles.resizeHandle} testID="depth-resize-handle">
          <Ionicons name="resize-outline" size={20} color="#F6F7F8" />
        </View> : null}
      </View>
      <View style={styles.controls}>
        <Pressable accessibilityLabel="收起深度图" accessibilityRole="button" accessibilityState={{ expanded: true }}
          onPress={close} style={styles.control} testID="depth-collapse">
          <Ionicons name="chevron-down" size={18} color="#F6F7F8" />
        </Pressable>
        <Pressable accessibilityLabel={resizing ? '锁定大小' : '调整大小'} accessibilityRole="switch"
          accessibilityState={{ checked: resizing, disabled: resizeDisabled }}
          disabled={resizeDisabled} onPress={() => {
            dragStart.current = null;
            setResizing(value => !value);
          }}
          style={[styles.control, resizing && styles.selected]} testID="depth-resize-toggle">
          <Ionicons name={resizing ? 'lock-open-outline' : 'lock-closed-outline'} size={18} color={resizeDisabled ? '#A0A09B' : '#F6F7F8'} />
        </Pressable>
      </View>
    </View>}
  </View>;
}

function clampSize(value: number, limit: number) {
  return Math.max(MIN_SIZE, Math.min(limit, Math.round(value)));
}

const styles = StyleSheet.create({
  slot: { alignItems: 'center', flex: 1, justifyContent: 'flex-end', width: '100%' },
  collapsed: { alignItems: 'center', backgroundColor: 'rgba(28, 28, 27, 0.78)', borderColor: 'rgba(232, 232, 230, 0.18)', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  controlText: { color: '#F6F7F8', fontSize: 12, fontWeight: '600' },
  frame: { backgroundColor: 'rgba(28, 28, 27, 0.86)', borderColor: 'rgba(232, 232, 230, 0.18)', borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  preview: { flex: 1, justifyContent: 'flex-end', overflow: 'hidden' },
  hidden: { opacity: 0 },
  status: { alignSelf: 'flex-start', backgroundColor: 'rgba(28, 28, 27, 0.78)', color: '#E8E8E6', fontSize: 11, paddingHorizontal: 5, paddingVertical: 2 },
  controls: { borderTopColor: 'rgba(232, 232, 230, 0.18)', borderTopWidth: 1, flexDirection: 'row' },
  control: { alignItems: 'center', flex: 1, justifyContent: 'center', minHeight: 44, minWidth: 44 },
  selected: { backgroundColor: 'rgba(232, 232, 230, 0.22)' },
  resizeHandle: { alignItems: 'center', backgroundColor: 'rgba(28, 28, 27, 0.86)', borderBottomLeftRadius: 12, height: 44, justifyContent: 'center', position: 'absolute', right: 0, top: 0, width: 44 },
});
