import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { cardLayout, getProductAppearance } from '../appearance';
import { Text } from '../components/AppText';
import { GradientButton } from '../components/GradientButton';
import {
  cancelFirmwareOtaJob,
  canCancelOtaPhase,
  describeReleaseTitle,
  formatFirmwareBytes,
  formatFirmwarePhase,
  inspectFirmwareOta,
  isDeviceOnlineFromStatus,
  isTerminalOtaPhase,
  listOtaDevices,
  partitionFirmwareReleases,
  readFirmwareOtaJob,
  startFirmwareOtaJob,
  type CloudOtaDevice,
  type CloudOtaInspectResult,
  type CloudOtaJob,
  type CloudOtaRelease,
} from '../services/firmwareOta';
import { type ThemeColors, useAppTheme } from '../theme';
import { typography } from '../typography';
import { getDevicePageLayout } from './devicePageLayout';

type Props = {
  deviceName: string;
  initialDeviceId?: string | null;
  onBack: () => void;
};

function makeIdempotencyKey(releaseId: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `app-${releaseId.slice(0, 24)}-${Date.now().toString(36)}-${rand}`;
}

export function FirmwareUpdateScreen({ deviceName, initialDeviceId, onBack }: Props) {
  const { colors, isDark } = useAppTheme();
  const p = getProductAppearance(isDark);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [containerWidth, setContainerWidth] = useState<number>();
  const layout = getDevicePageLayout({
    width,
    height,
    insetLeft: insets.left,
    insetRight: insets.right,
    containerWidth,
  });
  const isLandscape = layout.usesColumns;
  const styles = createStyles(colors, isDark);

  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [devices, setDevices] = useState<CloudOtaDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(initialDeviceId ?? null);
  const [inspection, setInspection] = useState<CloudOtaInspectResult | null>(null);
  const [activeJob, setActiveJob] = useState<CloudOtaJob | null>(null);
  const [activeRelease, setActiveRelease] = useState<CloudOtaRelease | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const refreshDevice = useCallback(async (deviceId: string) => {
    setLoading(true);
    setErrorText(null);
    try {
      const result = await inspectFirmwareOta(deviceId);
      setInspection(result);
    } catch (err) {
      setInspection(null);
      setErrorText(err instanceof Error ? err.message : '检查更新失败');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setErrorText(null);
    try {
      const listed = await listOtaDevices();
      const realDevices = listed.devices.filter((d) => !d.isSimulated);
      setDevices(realDevices);
      const nextId =
        (selectedDeviceId && realDevices.some((d) => d.id === selectedDeviceId) && selectedDeviceId)
        || (initialDeviceId && realDevices.some((d) => d.id === initialDeviceId) && initialDeviceId)
        || realDevices[0]?.id
        || null;
      setSelectedDeviceId(nextId);
      if (nextId) {
        const result = await inspectFirmwareOta(nextId);
        setInspection(result);
      } else {
        setInspection(null);
      }
    } catch (err) {
      setInspection(null);
      setErrorText(err instanceof Error ? err.message : '检查更新失败');
    } finally {
      setLoading(false);
    }
  }, [initialDeviceId, selectedDeviceId]);

  useEffect(() => {
    void loadAll();
    return stopPolling;
  }, [loadAll, stopPolling]);

  useEffect(() => {
    stopPolling();
    if (!activeJob || !selectedDeviceId || isTerminalOtaPhase(activeJob.phase)) {
      return;
    }
    const targetDeviceId = selectedDeviceId;
    const targetJobId = activeJob.jobId;
    pollRef.current = setInterval(() => {
      void readFirmwareOtaJob(targetDeviceId, targetJobId)
        .then(({ job }) => {
          setActiveJob(job);
          if (isTerminalOtaPhase(job.phase)) {
            stopPolling();
            void refreshDevice(targetDeviceId);
          }
        })
        .catch(() => undefined);
    }, 2000);
    return stopPolling;
  }, [activeJob, refreshDevice, selectedDeviceId, stopPolling]);

  const handleStartRelease = useCallback(async (release: CloudOtaRelease) => {
    if (!selectedDeviceId || submitting) return;
    setSubmitting(true);
    setErrorText(null);
    try {
      const { job } = await startFirmwareOtaJob(
        selectedDeviceId,
        release.releaseId,
        makeIdempotencyKey(release.releaseId),
      );
      setActiveRelease(release);
      setActiveJob(job);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '启动更新失败');
    } finally {
      setSubmitting(false);
    }
  }, [selectedDeviceId, submitting]);

  const handleCancelJob = useCallback(async () => {
    if (!selectedDeviceId || !activeJob || submitting) return;
    setSubmitting(true);
    try {
      const { job } = await cancelFirmwareOtaJob(selectedDeviceId, activeJob.jobId);
      setActiveJob(job);
    } catch (err) {
      setErrorText(err instanceof Error ? err.message : '取消失败');
    } finally {
      setSubmitting(false);
    }
  }, [activeJob, selectedDeviceId, submitting]);

  const partitioned = useMemo(
    () => partitionFirmwareReleases(inspection?.releases ?? []),
    [inspection?.releases],
  );
  const online = isDeviceOnlineFromStatus(inspection?.status ?? null);
  const currentVersion = inspection?.status?.firmwareVersion ?? '待同步';
  const displayedName = inspection?.deviceName ?? deviceName;
  const jobBusy = Boolean(activeJob && !isTerminalOtaPhase(activeJob.phase));
  const totalBytes = activeRelease?.artifactSizeBytes ?? 0;
  const downloadedBytes = activeJob?.bytesDownloaded ?? 0;
  const progressRatio = totalBytes > 0 ? Math.min(1, Math.max(0, downloadedBytes / totalBytes)) : 0;

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safe}>
      <ScrollView
        contentContainerStyle={[styles.content, width < 360 && styles.compactContent]}
        onLayout={({ nativeEvent }) => setContainerWidth(nativeEvent.layout.width)}
      >
        <View style={[styles.layout, isLandscape && [styles.landscapeLayout, { width: layout.contentWidth, gap: layout.gap }]]}>
          <View style={[styles.introPane, isLandscape && [styles.landscapePane, { width: layout.introWidth }]]}>
            <Pressable
              accessibilityLabel="返回设备设置"
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [styles.back, pressed && styles.pressed]}
            >
              <Ionicons color={colors.ink} name="chevron-back" size={22} />
            </Pressable>
            <View style={[styles.identity, isLandscape && styles.landscapeIdentity]}>
              <View style={styles.icon}>
                <Ionicons color={p.blueInk} name="cloud-download-outline" size={26} />
              </View>
              <Text style={styles.eyebrow}>DOSO FIRMWARE</Text>
              <Text accessibilityRole="header" style={styles.title}>固件更新</Text>
              <Text style={styles.deviceName}>{displayedName}</Text>
            </View>

            {devices.length > 1 ? (
              <View style={styles.deviceChips}>
                {devices.map((item) => {
                  const active = item.id === selectedDeviceId;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => {
                        setSelectedDeviceId(item.id);
                        setActiveJob(null);
                        setActiveRelease(null);
                        void refreshDevice(item.id);
                      }}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {item.displayName}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={[styles.detailsPane, isLandscape && [styles.landscapePane, { width: layout.detailsWidth }]]}>
            <View style={styles.card}>
              <View style={styles.rowBetween}>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, online ? styles.dotOnline : styles.dotOffline]} />
                  <Text style={styles.statusLabel}>
                    {loading ? '检查中' : online ? '在线' : '离线'}
                  </Text>
                </View>
                <Text style={styles.versionTag}>{currentVersion}</Text>
              </View>

              {errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}

              {activeJob ? (
                <View style={styles.jobBox}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>
                      {formatFirmwarePhase(activeJob.phase)}
                    </Text>
                    {activeRelease ? (
                      <Text style={styles.metaText}>{activeRelease.version}</Text>
                    ) : null}
                  </View>
                  {totalBytes > 0 ? (
                    <>
                      <View style={styles.progressTrack}>
                        <View
                          style={[
                            styles.progressFill,
                            { width: `${Math.round(progressRatio * 100)}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.metaText}>
                        {formatFirmwareBytes(downloadedBytes)} / {formatFirmwareBytes(totalBytes)}
                      </Text>
                    </>
                  ) : null}
                  {activeJob.message ? (
                    <Text style={styles.metaText}>{activeJob.message}</Text>
                  ) : null}
                  {canCancelOtaPhase(activeJob.phase) ? (
                    <GradientButton
                      disabled={submitting}
                      label="取消更新"
                      onPress={() => { void handleCancelJob(); }}
                      variant="dark"
                    />
                  ) : null}
                </View>
              ) : null}

              {!loading && !errorText && partitioned.primaryRelease ? (
                <View style={styles.releaseBox}>
                  <View style={styles.rowBetween}>
                    <Text style={styles.cardTitle}>
                      {describeReleaseTitle(partitioned.primaryRelease)}
                    </Text>
                    <Text style={styles.versionTag}>{partitioned.primaryRelease.version}</Text>
                  </View>
                  <Text style={styles.metaText}>
                    安装包 {formatFirmwareBytes(partitioned.primaryRelease.artifactSizeBytes)}
                  </Text>
                  <GradientButton
                    disabled={!online || submitting || jobBusy}
                    label={submitting ? '提交中' : '立即升级'}
                    onPress={() => {
                      if (partitioned.primaryRelease) {
                        void handleStartRelease(partitioned.primaryRelease);
                      }
                    }}
                  />
                </View>
              ) : !loading && !errorText && inspection ? (
                <Text style={styles.metaText}>已是最新</Text>
              ) : null}
            </View>

            {inspection?.isAdmin && partitioned.adminHardwareReleases.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>底层固件</Text>
                {partitioned.adminHardwareReleases.map((rel) => (
                  <View key={rel.releaseId} style={styles.adminRow}>
                    <View style={styles.adminInfo}>
                      <Text style={styles.adminTitle}>{describeReleaseTitle(rel)}</Text>
                      <Text style={styles.metaText}>
                        {rel.version} · {formatFirmwareBytes(rel.artifactSizeBytes)}
                      </Text>
                    </View>
                    <Pressable
                      disabled={!online || submitting || jobBusy}
                      onPress={() => { void handleStartRelease(rel); }}
                      style={({ pressed }) => [
                        styles.smallAction,
                        (!online || submitting || jobBusy) && styles.disabledAction,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.smallActionText}>升级</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.footerActions}>
              <GradientButton
                disabled={loading || submitting}
                label="重新检查"
                onPress={() => {
                  if (selectedDeviceId) {
                    void refreshDevice(selectedDeviceId);
                  } else {
                    void loadAll();
                  }
                }}
                variant="dark"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: ThemeColors, isDark: boolean) => {
  const p = getProductAppearance(isDark);
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.background },
    content: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 22, paddingBottom: 28 },
    compactContent: { paddingHorizontal: 16 },
    layout: { gap: 24, width: '100%', maxWidth: 960, alignSelf: 'center' },
    landscapeLayout: { flexDirection: 'row' },
    introPane: { flex: 1, minWidth: 0 },
    back: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    pressed: { opacity: 0.7 },
    identity: { marginTop: 24, gap: 10 },
    landscapeIdentity: { marginTop: 16, gap: 8 },
    icon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surface,
    },
    eyebrow: { ...typography.caption, color: p.secondary, letterSpacing: 1, marginTop: 4 },
    title: { ...typography.compactTitle, color: p.ink },
    deviceName: { ...typography.supporting, color: p.secondary },
    deviceChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      backgroundColor: p.surface,
    },
    chipActive: { backgroundColor: p.blueInk },
    chipText: { ...typography.caption, color: p.secondary },
    chipTextActive: { color: '#ffffff' },
    detailsPane: { flex: 1.15, minWidth: 0, gap: 16 },
    landscapePane: { flex: 0, flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
    card: {
      padding: cardLayout.inset,
      borderRadius: cardLayout.radius,
      backgroundColor: p.surface,
      gap: 14,
    },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    dotOnline: { backgroundColor: '#22c55e' },
    dotOffline: { backgroundColor: colors.muted },
    statusLabel: { ...typography.supporting, color: p.ink },
    versionTag: { ...typography.supporting, color: p.blueInk },
    cardTitle: { ...typography.label, color: p.ink },
    metaText: { ...typography.supporting, color: p.secondary },
    errorText: { ...typography.supporting, color: '#ef4444' },
    jobBox: { gap: 10, paddingTop: 4 },
    releaseBox: { gap: 10, paddingTop: 4 },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    progressFill: { height: 6, borderRadius: 3, backgroundColor: p.blueInk },
    adminRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 6,
    },
    adminInfo: { flex: 1, gap: 2 },
    adminTitle: { ...typography.supporting, color: p.ink },
    smallAction: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: p.blueInk,
    },
    disabledAction: { opacity: 0.4 },
    smallActionText: { ...typography.caption, color: '#ffffff' },
    footerActions: { gap: 12 },
  });
};
