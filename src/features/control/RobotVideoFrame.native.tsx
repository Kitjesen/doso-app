import { type ReactNode, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

type NativeVideoView = (props: {
  mirror?: boolean;
  objectFit?: 'contain' | 'cover';
  streamURL?: string;
  style?: object;
  zOrder?: number;
}) => ReactNode;

export function RobotVideoFrame({ streamUrl, rotationDegrees }: { streamUrl: string; rotationDegrees: number }): ReactNode {
  const RTCView = useMemo(() => {
    try {
      const view = (require('react-native-webrtc') as { RTCView?: NativeVideoView }).RTCView;
      return typeof view === 'function' ? view : null;
    } catch {
      return null;
    }
  }, []);
  if (!RTCView || !streamUrl) return null;
  const turn = Number.isFinite(rotationDegrees) ? ((rotationDegrees % 360) + 360) % 360 : 0;
  return (
    <View pointerEvents="none" style={styles.fill}>
      <RTCView
        mirror={false}
        objectFit="cover"
        streamURL={streamUrl}
        style={[styles.fill, turn ? { transform: [{ rotate: `${turn}deg` }] } : null]}
        zOrder={0}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
});
