import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/**
 * Generated yard plate for the connected landscape Design-QA preview.
 * It is not a live camera and not a third-party product screenshot.
 */
export function ControlPreviewCameraPlate() {
  return (
    <View style={styles.fill} testID="control-preview-camera">
      <LinearGradient colors={['#B9C6CE', '#D5DDE0', '#C9C3B6']} locations={[0, 0.42, 1]} style={StyleSheet.absoluteFill} />
      <View style={styles.building} />
      <View style={styles.door} />
      <View style={styles.grassLeft} />
      <View style={styles.grassRight} />
      <View style={styles.path} />
      <View style={styles.weed} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  building: { backgroundColor: '#E4E7EB', height: '18%', left: '28%', position: 'absolute', right: '4%', top: '6%' },
  door: { backgroundColor: '#5C6570', height: '10%', left: '46%', position: 'absolute', top: '14%', width: '14%' },
  grassLeft: { backgroundColor: '#6F8F58', bottom: 0, left: 0, position: 'absolute', top: '28%', width: '22%' },
  grassRight: { backgroundColor: '#7B9A60', bottom: 0, position: 'absolute', right: 0, top: '30%', width: '16%' },
  path: { backgroundColor: '#C8C2B6', bottom: 0, left: '16%', position: 'absolute', right: '10%', top: '30%' },
  weed: { backgroundColor: '#5E7A48', borderRadius: 8, bottom: '22%', height: 16, left: '6%', position: 'absolute', width: 26 },
});
