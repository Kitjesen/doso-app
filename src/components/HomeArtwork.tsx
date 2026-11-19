import { LinearGradient } from 'expo-linear-gradient';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

// Decorative crops from the approved artwork; never device telemetry or a camera feed.
const regions = {
  robot: [89, 162, 515, 295],
  lens: [833, 686, 122, 108],
  map: [976, 775, 211, 53],
  cloud: [356, 761, 207, 65],
  body: [1060, 903, 133, 77],
  waves: [789, 947, 129, 30],
} as const;

export function HomeArtwork({ kind, style }: { kind: keyof typeof regions; style?: ViewStyle }) {
  const [x, y, width, height] = regions[kind];
  return <View pointerEvents="none" accessible={false} style={[styles.crop, style]}>
    <Image source={require('../../assets/figma/home-reference.png')} accessible={false} resizeMode="stretch" style={{
      position: 'absolute', width: `${1312 / width * 100}%`, height: `${1199 / height * 100}%`,
      left: `${-x / width * 100}%`, top: `${-y / height * 100}%`,
    }} />
    {kind !== 'robot' && kind !== 'lens' ? <LinearGradient colors={['#FAFBFE', '#FAFBFE00']} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '28%' }} /> : null}
  </View>;
}

const styles = StyleSheet.create({ crop: { overflow: 'hidden' } });
