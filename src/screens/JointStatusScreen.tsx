import { type ReactNode, useEffect } from 'react';
import { AppState, type ImageSourcePropType, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '../components/AppText';
import {
  motorHealthLabel,
  STATUS_NEUTRAL,
  StatusBentoCard,
  type StatusBentoBody,
} from '../components/StatusBentoCard';
import { getProductAppearance } from '../appearance';
import type { ControlImuReading, ControlJointState } from '../features/control/controlOperations';
import { setControlNavigationHidden } from '../services/brainstemGrpc';
import { useAppTheme } from '../theme';

type Props = {
  isWorkspace?: boolean;
  connectionLabel?: string;
  remoteStatus?: ReactNode;
  body?: StatusBentoBody;
  imu?: ControlImuReading | null;
  showImu?: boolean;
  deviceName: string;
  robotDiagram?: ImageSourcePropType;
  studioDiagram?: ImageSourcePropType;
  joints?: readonly ControlJointState[];
  observedAt?: string;
  refreshing?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onBack: () => void;
};

export function JointStatusScreen({
  isWorkspace = false,
  connectionLabel,
  remoteStatus,
  deviceName,
  robotDiagram,
  studioDiagram,
  body,
  imu = null,
  showImu = false,
  joints = [],
  observedAt,
  refreshing = false,
  error,
  onRefresh,
  onBack,
}: Props) {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const reserveRightNav = isWorkspace && isLandscape;

  useEffect(() => {
    const updateNavigation = (state: string) => { void setControlNavigationHidden(isLandscape && state === 'active'); };
    updateNavigation(AppState.currentState);
    const subscription = AppState.addEventListener('change', updateNavigation);
    return () => { subscription.remove(); void setControlNavigationHidden(false); };
  }, [isLandscape]);

  const { isDark } = useAppTheme();
  const appearance = getProductAppearance(isDark);
  const canvasBg = isDark ? STATUS_NEUTRAL.canvas : appearance.canvas;
  const cardBg = isDark ? STATUS_NEUTRAL.cardBg : appearance.surface;
  const hairlineSoftCol = isDark ? STATUS_NEUTRAL.hairlineSoft : 'rgba(20, 20, 20, 0.08)';
  const mutedCol = isDark ? STATUS_NEUTRAL.muted : appearance.secondary;
  const subtleCol = isDark ? STATUS_NEUTRAL.subtle : '#777777';

  // Only validated, read-only joint records are forwarded to the display card.
  const validatedJoints = joints.filter(
    joint => typeof joint?.id === 'string' && joint.id.length > 0 && typeof joint.label === 'string' && joint.label.length > 0,
  );
  const deviceReportedCount = validatedJoints.filter(joint => joint.source === 'device' && motorHealthLabel(joint).length > 0).length;

  const emptyBanner = (
    <View
      accessibilityLabel={deviceReportedCount === 0 ? '待设备同步' : undefined}
      style={[styles.emptyBar, { backgroundColor: cardBg, borderColor: hairlineSoftCol }]}
      testID="joint-status-empty"
    >
      <Text numberOfLines={1} style={[styles.emptyTitle, { color: mutedCol }]}>待设备同步</Text>
      <Text numberOfLines={1} style={[styles.emptySub, { color: subtleCol }]}>连接设备并完成状态读取后显示</Text>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={[styles.safe, { backgroundColor: canvasBg }]} testID="joint-status-screen">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          isLandscape && styles.contentLandscape,
          reserveRightNav && styles.rightRailClearance,
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.centeredStage}>
          <StatusBentoCard
            body={body}
            connectionLabel={connectionLabel}
            deviceName={deviceName}
            emptyBanner={emptyBanner}
            error={error}
            imu={imu}
            isWorkspace={isWorkspace}
            joints={validatedJoints}
            maxWidth={reserveRightNav ? Math.max(320, width - 112) : Math.max(320, width - 32)}
            observedAt={observedAt}
            onBack={onBack}
            onRefresh={onRefresh}
            refreshing={refreshing}
            remoteStatus={remoteStatus}
            robotDiagram={robotDiagram}
            showImu={showImu}
            studioDiagram={studioDiagram}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingBottom: 18, paddingHorizontal: 18, paddingTop: 10 },
  contentLandscape: { paddingBottom: 12, paddingTop: 8 },
  rightRailClearance: { paddingRight: 84 },
  centeredStage: { alignSelf: 'center', maxWidth: 748, width: '100%' },
  emptyBar: { alignItems: 'center', borderRadius: 10, borderWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 7 },
  emptyTitle: { fontSize: 11.5, fontWeight: '600', lineHeight: 15 },
  emptySub: { flex: 1, fontSize: 11, lineHeight: 14 },
});
