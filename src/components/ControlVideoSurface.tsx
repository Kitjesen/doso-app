import { type ReactNode, useEffect, useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { Text } from './AppText';

/**
 * Supplied by a video receiver, independently of the Brainstem control link.
 * `receiving` means decoded frame timestamps are advancing, not merely that a
 * socket/player opened. `id` is a unique receiver-session id, not a camera URL.
 * A provider must retire old callbacks and create a new id after suspension.
 */
export type ControlVideoPresentation = Readonly<{
  id: string;
  phase: 'unconfigured' | 'connecting' | 'receiving' | 'stalled' | 'error';
}>;

type Props = Readonly<{
  presentation?: ControlVideoPresentation;
  surface?: ReactNode;
  active: boolean;
  onInterrupted: () => void;
}>;

const messages = {
  unconfigured: '尚未配置视频',
  connecting: '正在连接视频',
  stalled: '视频已中断',
  error: '视频连接失败',
} as const;

export function ControlVideoSurface({ presentation, surface, active, onInterrupted }: Props) {
  const suspendedId = useRef<string | undefined>(undefined);
  if (!active && presentation) suspendedId.current = presentation.id;
  const hasSurface = surface !== null && surface !== undefined && surface !== false;
  const phase = presentation?.phase === 'receiving' && !hasSurface
    ? 'error'
    : presentation?.phase === 'receiving' && suspendedId.current === presentation.id
    ? 'connecting'
    : presentation?.phase ?? 'unconfigured';
  const previous = useRef<{ id: string | undefined; receiving: boolean }>({ id: undefined, receiving: false });
  const onInterruptedRef = useRef(onInterrupted);
  onInterruptedRef.current = onInterrupted;

  useEffect(() => {
    const prior = previous.current;
    const receiving = active && phase === 'receiving';
    previous.current = { id: presentation?.id, receiving };
    // Unconfigured media must not block existing line-of-sight controls. Only a
    // lost/replaced live feed retires old manual intent; recovery never arms it.
    // ControlScreen already handles app background and unmount cancellation.
    if (active && prior.receiving && (!receiving || prior.id !== presentation?.id)) {
      onInterruptedRef.current();
    }
  }, [active, phase, presentation?.id]);

  const canMountSurface = active && hasSurface && phase !== 'unconfigured' && phase !== 'error';
  const message = !active ? '视频已暂停' : phase === 'receiving' ? null : messages[phase];

  return (
    <View testID="control-video-surface" pointerEvents="none" style={styles.stage}>
      {canMountSurface ? <View testID="control-video-player" style={[StyleSheet.absoluteFill, phase !== 'receiving' && styles.hiddenFrame]}>{surface}</View> : null}
      {message ? (
        <View testID="control-video-status" style={styles.status}>
          <View style={styles.statusIcon}><Ionicons name="videocam-outline" size={28} color="#8B8D98" /></View>
          <Text style={styles.statusText}>{message}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#F9F9FB' },
  hiddenFrame: { opacity: 0 },
  status: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: 12 },
  statusIcon: { alignItems: 'center', justifyContent: 'center', width: 48, height: 48 },
  statusText: { color: '#80838D', fontSize: 14, lineHeight: 22, fontWeight: '400' },
});
