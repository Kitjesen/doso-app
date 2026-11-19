import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { parseRobotCode, type RobotClaim } from '../features/robot-lifecycle/robotCode';
import { useAppTheme } from '../theme';
import { typography } from '../typography';
import { Text } from './AppText';
import { GradientButton } from './GradientButton';

type Props = {
  onScan: (claim: RobotClaim) => void;
  onClose: () => void;
};

export function DeviceScanner({ onScan, onClose }: Props) {
  const { colors } = useAppTheme();
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [scanError, setScanError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const accepting = useRef(true);

  useEffect(() => {
    accepting.current = true;
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active' && accepting.current) {
        void getPermission().catch(() => {
          if (accepting.current) setScanError('无法刷新相机权限，请关闭扫码后重试。');
        });
      }
    });
    return () => {
      accepting.current = false;
      subscription.remove();
    };
  }, [getPermission]);

  const close = () => {
    accepting.current = false;
    onClose();
  };
  const openCamera = async () => {
    setScanError(null);
    try {
      await requestPermission();
    } catch {
      if (accepting.current) setScanError('无法取得相机权限，请重试。');
    }
  };
  const openSettings = async () => {
    try {
      await Linking.openSettings();
    } catch {
      if (accepting.current) setScanError('请在系统设置中允许 DOSO 使用相机。');
    }
  };
  const readCode = ({ data }: BarcodeScanningResult) => {
    if (!accepting.current) return;
    const claim = parseRobotCode(data);
    if (!claim) {
      setScanError('请扫描随设备提供的专属绑定二维码');
      return;
    }
    accepting.current = false;
    setScanned(true);
    onScan(claim);
  };
  let message = '正在读取相机权限…';
  if (permission) {
    const settings = Platform.OS === 'web' ? '浏览器设置' : '系统设置';
    message = permission.canAskAgain
      ? '允许相机后即可扫描机器人二维码。'
      : `请在${settings}中允许使用相机。`;
  }
  if (scanned) message = '已识别绑定二维码';
  if (cameraError) message = cameraError;

  return (
    <Modal animationType="slide" onRequestClose={close} visible>
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="取消扫码" accessibilityRole="button" onPress={close} style={styles.back}>
            <Ionicons color={colors.ink} name="chevron-back" size={24} />
          </Pressable>
          <Text style={[styles.title, { color: colors.ink }]}>扫描专属绑定二维码</Text>
        </View>
        <View style={styles.content}>
          {permission?.granted && !cameraError && !scanned ? (
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              facing="back"
              onBarcodeScanned={readCode}
              onMountError={() => { if (accepting.current) setCameraError('相机暂时不可用，请重试。'); }}
              style={styles.camera}
              testID="device-scanner-camera"
            />
          ) : (
            <View style={[styles.placeholder, { backgroundColor: colors.surface }]}>
              <Ionicons color={colors.muted} name="scan-outline" size={64} />
              <Text style={[styles.message, { color: colors.ink }]}>
                {message}
              </Text>
              {cameraError ? <GradientButton label="重试相机" onPress={() => setCameraError(null)} variant="auth" /> : null}
              {permission && !permission.granted && permission.canAskAgain ? <GradientButton label="允许使用相机" onPress={() => void openCamera()} variant="auth" /> : null}
              {permission && !permission.granted && !permission.canAskAgain && Platform.OS !== 'web' ? <GradientButton label="打开系统设置" onPress={() => void openSettings()} variant="auth" /> : null}
            </View>
          )}
          {scanError ? <Text accessibilityLiveRegion="polite" style={[styles.message, { color: colors.dangerText }]}>{scanError}</Text> : null}
          <Text style={[styles.message, { color: colors.muted }]}>对准随设备提供的专属绑定二维码，识别后确认绑定。</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  back: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.compactTitle, flexShrink: 1 },
  content: { flex: 1, padding: 24, gap: 16 },
  camera: { flex: 1, minHeight: 240, borderRadius: 24, overflow: 'hidden' },
  placeholder: { flex: 1, minHeight: 240, padding: 24, gap: 24, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  message: { ...typography.supporting, textAlign: 'center' },
});
