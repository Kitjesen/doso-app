import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { AppState, BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import { ControlVideoSurface } from '../components/ControlVideoSurface';
import { DepthSnapshotView } from '../components/DepthSnapshotView';
import { videoProbeBaseUrl } from '../features/control/videoProbeUrl';
import { useControlVideoReceiver } from '../features/video/useControlVideoReceiver';

type Props = Readonly<{
  origin: string;
  viewerToken?: string;
  allowLocalHttp: boolean;
  depthHost?: string;
  onBack: () => void;
}>;

/** Explicit viewing has no robot-control association, including on split hosts. */
export function VideoViewerScreen({ origin, viewerToken, allowLocalHttp, depthHost, onBack }: Props) {
  const [appState, setAppState] = useState(AppState.currentState);
  const active = appState === 'active';
  const video = useControlVideoReceiver({ deviceId: `viewer:${origin}`, gatewayUrl: origin, viewerToken, allowLocalHttp }, active);
  const depthOrigin = allowLocalHttp && !viewerToken ? videoProbeBaseUrl(depthHost) : null;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => { onBack(); return true; });
    return () => subscription.remove();
  }, [onBack]);

  return <SafeAreaView style={styles.safe} testID="video-viewer-screen">
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="关闭视频" onPress={onBack} style={styles.button} testID="video-viewer-back">
        <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
      </Pressable>
      <View style={styles.heading}>
        <Text style={styles.title}>实时视频</Text>
        <Text numberOfLines={1} style={styles.source} testID="video-viewer-source">{origin}</Text>
      </View>
      {video.presentation.phase === 'error' || video.presentation.phase === 'stalled' ?
        <Pressable accessibilityRole="button" accessibilityLabel="重新连接视频" onPress={video.reconnect} style={styles.button} testID="video-viewer-reconnect">
          <Ionicons name="refresh" size={22} color="#FFFFFF" />
        </Pressable> : null}
    </View>
    <View style={styles.stage}>
      <ControlVideoSurface presentation={video.presentation} surface={video.surface} active={active} onInterrupted={() => {}} />
      {depthHost && depthOrigin === origin ? <View pointerEvents="box-none" style={styles.depth} testID="video-viewer-depth">
        <DepthSnapshotView key={depthOrigin} host={depthHost} active={active} />
      </View> : null}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#000000' },
  stage: { flex: 1, position: 'relative' },
  depth: { ...StyleSheet.absoluteFill, paddingHorizontal: 12, paddingVertical: 8 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, backgroundColor: 'rgba(0,0,0,0.48)' },
  button: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, gap: 2 },
  title: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: '#FFFFFF' },
  source: { fontSize: 12, lineHeight: 18, color: '#D5DCE5' },
});
