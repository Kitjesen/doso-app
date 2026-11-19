import { Image, StyleSheet, View } from 'react-native';
import { CloudVideoPreview } from '../features/video/CloudVideoScreen';

// Static design frames are confined to QA and never start a media receiver.
function Frame({ top }: { top: number }) {
  const x = 1018, width = 410, height = 190;
  return <View style={styles.frame}><Image accessible={false} resizeMode="stretch" source={require('../../assets/qa/video-reference.png')}
    style={{ position: 'absolute', width: `${1478 / width * 100}%`, height: `${1064 / height * 100}%`, left: `${-x / width * 100}%`, top: `${-top / height * 100}%` }} /></View>;
}

export function VideoFixture({ onBack }: { onBack: () => void }) {
  return <CloudVideoPreview onBack={onBack} frames={[
    { id: 'qa-camera-1', label: 'THUNDER 01', content: <Frame top={188} /> },
    { id: 'qa-camera-2', label: 'THUNDER 02', content: <Frame top={432} /> },
  ]} />;
}

const styles = StyleSheet.create({ frame: { flex: 1, overflow: 'hidden' } });
