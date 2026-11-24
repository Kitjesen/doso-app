import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { ControlPanelMotion } from '../components/ControlPanelMotion';
import { ProductHeader } from '../components/ProductHeader';
import { Text } from '../components/HomeText';
import type { LayoutChangeEvent } from 'react-native';
import { getProfileLayoutMetrics } from './profileLayout';
import type { ProfileLayoutMetrics } from './profileLayout';
import { AppearanceControlContext, useAppTheme } from '../theme';
import type { ThemeColors } from '../theme';
import { FontLicenseNotice } from '../components/FontLicenseNotice';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';

const FSD_MATTE = {
  canvas: '#141414',
  sheet: '#1D1D1D',
  well: '#242424',
  recessed: '#171717',
  active: '#303030',
  divider: 'rgba(255, 255, 255, 0.08)',
  ink: '#F2F2F2',
  muted: '#9A9A9A',
  ctaBg: '#F2F2F2',
  ctaInk: '#141414',
  emerald: '#34D399',
  emeraldSoft: 'rgba(52, 211, 153, 0.15)',
  emeraldInk: '#34D399',
  dangerInk: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.14)',
} as const;

type Props = {
  detailsOnly?: boolean;
  connected: boolean;
  canDisconnect?: boolean;
  batteryPercent?: number | null;
  deviceName: string;
  deviceType: string;
  firmwareVersion?: string;
  lastSyncLabel?: string;
  canOpenFirmwareUpdate: boolean;
  canOpenProvisioning: boolean;
  firmwareUpdateBlockedReason?: string;
  provisioningBlockedReason?: string;
  runtimeHours?: number | null;
  deviceId?: string;
  robotVersion?: string;
  safetyLock: boolean | null;
  alertsEnabled: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenBleDiscovery: () => void;
  onOpenProvisioning: () => void;
  onOpenFirmwareUpdate: () => void;
  onOpenControl?: () => void;
  onOpenRobotConnection?: () => void;
  onOpenDataPrivacy?: () => void;
  onCheckUpdate?: () => void;
  onRetry: () => void;
  onToggleAlerts: () => void;
};

type Styles = ReturnType<typeof createStyles>;

export function ProfileHub(props: Props & { initialDeviceOpen?: boolean }) {
  const { colors, isDark } = useAppTheme();
  const appearance = useContext(AppearanceControlContext);
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isWideLandscape = isLandscape && width >= 700;
  const [deviceOpen, setDeviceOpen] = useState(props.initialDeviceOpen ?? false);
  const [panel, setPanel] = useState<'notifications' | 'appearance' | 'about' | null>(null);
  useEffect(() => {
    if (props.initialDeviceOpen) setDeviceOpen(true);
  }, [props.initialDeviceOpen]);

  if (deviceOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: isDark ? FSD_MATTE.canvas : colors.background }}>
        <View style={isLandscape ? hubStyles.headerRailClearance : undefined}>
          <ProductHeader robotName={props.deviceName} connected={props.connected} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="返回设置" onPress={() => setDeviceOpen(false)} style={[hubStyles.back, isLandscape && hubStyles.rightRailClearance]}>
          <Ionicons name="chevron-back" size={20} color={isDark ? FSD_MATTE.ink : colors.ink} />
          <Text style={[hubStyles.heading, { color: isDark ? FSD_MATTE.ink : colors.ink, fontSize: 18 }]}>设备详情</Text>
        </Pressable>
        <View style={[{ flex: 1 }, isLandscape && hubStyles.rightRailClearance]}>
          <ProfileScreen {...props} detailsOnly />
        </View>
      </View>
    );
  }

  const appVersion = require('../../app.json').expo.version;
  const rows = [
    {
      title: '通知提醒',
      value: props.alertsEnabled ? '开启' : '关闭',
      icon: 'notifications-outline' as const,
      action: () => setPanel('notifications'),
    },
    {
      title: '主题外观',
      value: appearance.preference === null ? '跟随系统' : appearance.preference === 'dark' ? '深色' : '浅色',
      icon: 'color-palette-outline' as const,
      action: () => setPanel('appearance'),
    },
    ...(props.onOpenDataPrivacy ? [{
      title: '数据与隐私',
      value: undefined,
      icon: 'shield-checkmark-outline' as const,
      action: props.onOpenDataPrivacy,
    }] : []),
    ...(props.onCheckUpdate ? [{
      title: '检查更新',
      value: `v${appVersion}`,
      icon: 'cloud-download-outline' as const,
      action: props.onCheckUpdate,
    }] : []),
    {
      title: '关于 DOSO',
      value: `v${appVersion}`,
      icon: 'information-circle-outline' as const,
      action: () => setPanel('about'),
    },
  ];
  const deviceStatus = props.connected ? '已连接' : '未连接';
  const modelLabel = props.deviceType ? props.deviceType : (props.robotVersion && props.robotVersion !== '待同步' ? props.robotVersion : '');
  const disconnectEnabled = props.canDisconnect ?? props.connected;

  return (
    <View style={hubStyles.shell}>
      <View style={isLandscape ? hubStyles.headerRailClearance : undefined}>
        <ProductHeader robotName={props.deviceName} connected={props.connected} onDevicePress={() => setDeviceOpen(true)} />
      </View>
      <ScrollView contentContainerStyle={[hubStyles.page, isLandscape && hubStyles.rightRailClearance]} showsVerticalScrollIndicator={false}>
        <View style={hubStyles.container}>
          <View style={hubStyles.topTitleBar}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text accessibilityRole="header" style={hubStyles.heading}>设置</Text>
            </View>
            {props.onOpenControl ? (
              <Pressable
                accessibilityLabel="返回操控画面"
                accessibilityRole="button"
                onPress={props.onOpenControl}
                style={({ pressed }) => [hubStyles.returnControlBtn, pressed && hubStyles.pressed]}
                testID="settings-return-control"
              >
                <Ionicons color={FSD_MATTE.ctaInk} name="game-controller-outline" size={16} />
                <Text numberOfLines={1} style={hubStyles.returnControlText}>返回操控</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[hubStyles.grid, isWideLandscape && hubStyles.gridLandscape]}>
            <View style={hubStyles.col}>
              <Text style={hubStyles.sectionLab}>当前设备</Text>
              <View style={hubStyles.group}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={'管理设备 ' + props.deviceName}
                  onPress={() => setDeviceOpen(true)}
                  style={({ pressed }) => [hubStyles.deviceHeroRow, pressed && hubStyles.pressed]}
                  testID="settings-device-entry"
                >
                  <View style={hubStyles.deviceTopLine}>
                    <View style={[hubStyles.statusBadge, props.connected ? hubStyles.statusBadgeOnline : null]}>
                      <View style={[hubStyles.statusDot, props.connected ? hubStyles.statusDotOnline : null]} />
                      <Text numberOfLines={1} style={[hubStyles.statusBadgeText, props.connected ? hubStyles.statusBadgeTextOnline : null]}>{deviceStatus}</Text>
                    </View>
                    <Text numberOfLines={1} style={hubStyles.rowRight}>详情 ›</Text>
                  </View>
                  <Text style={hubStyles.deviceTitle}>{props.deviceName}</Text>
                  {modelLabel ? <Text style={hubStyles.rowSub}>{modelLabel}</Text> : null}
                  <View style={hubStyles.metaGrid}>
                    <View style={hubStyles.metaCell}>
                      <Text style={hubStyles.metaLabel}>设备地址</Text>
                      <Text selectable style={hubStyles.metaValue}>{props.deviceId ?? '未连接'}</Text>
                    </View>
                    <View style={hubStyles.metaCell}>
                      <Text style={hubStyles.metaLabel}>设备版本</Text>
                      <Text style={hubStyles.metaValue}>{props.robotVersion ?? '待同步'}</Text>
                    </View>
                    <View style={hubStyles.metaCell}>
                      <Text style={hubStyles.metaLabel}>上次同步</Text>
                      <Text style={hubStyles.metaValue}>{props.lastSyncLabel ?? '尚未同步'}</Text>
                    </View>
                  </View>
                </Pressable>

                <View style={hubStyles.quickActionsRow}>
                  <Pressable
                    accessibilityLabel="打开连接配置"
                    accessibilityRole="button"
                    onPress={props.onOpenRobotConnection ?? props.onConnect}
                    style={({ pressed }) => [hubStyles.quickActionBtn, hubStyles.quickActionPrimary, pressed && hubStyles.pressed]}
                    testID="settings-open-connection"
                  >
                    <Ionicons color={FSD_MATTE.ctaInk} name="wifi-outline" size={15} />
                    <Text numberOfLines={1} style={hubStyles.quickActionPrimaryText}>连接配置</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="扫描附近蓝牙设备"
                    accessibilityRole="button"
                    onPress={props.onOpenBleDiscovery}
                    style={({ pressed }) => [hubStyles.quickActionBtn, pressed && hubStyles.pressed]}
                    testID="settings-open-ble"
                  >
                    <Ionicons color={FSD_MATTE.ink} name="bluetooth-outline" size={15} />
                    <Text numberOfLines={1} style={hubStyles.quickActionText}>蓝牙扫描</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="断开当前机器狗连接"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !disconnectEnabled }}
                    disabled={!disconnectEnabled}
                    onPress={props.onDisconnect}
                    style={({ pressed }) => [hubStyles.quickActionBtn, disconnectEnabled && hubStyles.quickActionDanger, !disconnectEnabled && hubStyles.disabled, pressed && disconnectEnabled && hubStyles.pressed]}
                    testID="settings-disconnect"
                  >
                    <Ionicons color={disconnectEnabled ? FSD_MATTE.dangerInk : FSD_MATTE.muted} name="close-circle-outline" size={15} />
                    <Text numberOfLines={1} style={[hubStyles.quickActionText, disconnectEnabled && { color: FSD_MATTE.dangerInk }]}>断开连接</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={hubStyles.col}>
              <Text style={hubStyles.sectionLab}>系统偏好</Text>
              <View style={hubStyles.group}>
                {rows.map((row, index) => (
                  <Pressable
                    key={row.title}
                    accessibilityRole="button"
                    accessibilityLabel={row.title}
                    disabled={!row.action}
                    onPress={row.action}
                    style={({ pressed }) => [hubStyles.rowline, index > 0 && hubStyles.rowlineBorder, pressed && hubStyles.pressed]}
                  >
                    <View style={hubStyles.rowIcon}><Ionicons color={FSD_MATTE.ink} name={row.icon} size={16} /></View>
                    <View style={hubStyles.rowLeft}>
                      <Text numberOfLines={1} style={hubStyles.rowName}>{row.title}</Text>
                    </View>
                    {row.value ? <View style={hubStyles.valuePill}><Text numberOfLines={1} style={hubStyles.rowRight}>{row.value}</Text></View> : null}
                    <Ionicons color={FSD_MATTE.muted} name="chevron-forward" size={15} />
                  </Pressable>
                ))}
              </View>
            </View>
          </View>

          <Text style={hubStyles.ver}>DOSO Robotics · v{appVersion}</Text>
        </View>
      </ScrollView>
      <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={() => setPanel(null)}>
        <View style={hubStyles.backdrop}>
          <ControlPanelMotion style={hubStyles.sheet}>
            <View style={hubStyles.panelHeading}>
              <Text style={[hubStyles.section, { color: FSD_MATTE.ink }]}>
                {panel === 'notifications' ? '通知提醒' : panel === 'appearance' ? '主题外观' : '关于 DOSO'}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="关闭设置面板" onPress={() => setPanel(null)} style={hubStyles.closeBtn}>
                <Ionicons name="close" size={20} color={FSD_MATTE.ink} />
              </Pressable>
            </View>
            {panel === 'appearance' ? (
              <View style={hubStyles.sheetGroup}>
                {([{ label: '跟随系统', value: null }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }] as const).map((option, idx) => (
                  <Pressable
                    key={option.label}
                    accessibilityRole="radio"
                    aria-checked={appearance.preference === option.value}
                    accessibilityLabel={option.label}
                    accessibilityState={{ checked: appearance.preference === option.value }}
                    disabled={!appearance.onChange}
                    onPress={() => appearance.onChange?.(option.value)}
                    style={[hubStyles.sheetRow, idx > 0 && hubStyles.rowlineBorder]}
                  >
                    <Text style={hubStyles.sheetRowLabel}>{option.label}</Text>
                    {appearance.preference === option.value ? <Ionicons name="checkmark" size={18} color={FSD_MATTE.ink} /> : null}
                  </Pressable>
                ))}
              </View>
            ) : panel === 'notifications' ? (
              <View style={hubStyles.sheetGroup}>
                <View style={hubStyles.sheetRow}>
                  <Text style={hubStyles.sheetRowLabel}>状态提醒</Text>
                  <Switch
                    accessibilityLabel="状态提醒"
                    value={props.alertsEnabled}
                    onValueChange={props.onToggleAlerts}
                    thumbColor="#FFFFFF"
                    trackColor={{ false: FSD_MATTE.active, true: FSD_MATTE.emerald }}
                  />
                </View>
              </View>
            ) : panel === 'about' ? (
              <>
                <Text style={{ color: FSD_MATTE.ink, fontSize: 14, fontWeight: '600', marginBottom: 8 }}>DOSO Robotics · v{appVersion}</Text>
                <FontLicenseNotice />
              </>
            ) : null}
          </ControlPanelMotion>
        </View>
      </Modal>
    </View>
  );
}

const hubStyles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: FSD_MATTE.canvas },
  page: { paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 },
  headerRailClearance: { paddingRight: 64 },
  rightRailClearance: { paddingRight: 84 },
  container: { alignSelf: 'center', maxWidth: 960, width: '100%' },
  topTitleBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4, marginBottom: 14 },
  returnControlBtn: { alignItems: 'center', backgroundColor: FSD_MATTE.ctaBg, borderRadius: 10, flexDirection: 'row', gap: 6, minHeight: 38, paddingHorizontal: 14 },
  returnControlText: { color: FSD_MATTE.ctaInk, fontSize: 13, fontWeight: '700' },
  grid: { flexDirection: 'column', gap: 14 },
  gridLandscape: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  col: { flex: 1, minWidth: 0 },
  sectionLab: { marginBottom: 8, marginLeft: 4, fontSize: 12, lineHeight: 16, color: FSD_MATTE.muted, fontWeight: '600' },
  group: { backgroundColor: FSD_MATTE.sheet, borderColor: FSD_MATTE.divider, borderRadius: 20, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  deviceHeroRow: { padding: 16, gap: 6 },
  deviceTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { alignItems: 'center', backgroundColor: FSD_MATTE.well, borderRadius: 999, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeOnline: { backgroundColor: FSD_MATTE.emeraldSoft },
  statusDot: { backgroundColor: FSD_MATTE.muted, borderRadius: 3.5, height: 7, width: 7 },
  statusDotOnline: { backgroundColor: FSD_MATTE.emerald },
  statusBadgeText: { color: FSD_MATTE.muted, fontSize: 12, fontWeight: '600' },
  statusBadgeTextOnline: { color: FSD_MATTE.emeraldInk },
  deviceTitle: { color: FSD_MATTE.ink, fontSize: 19, fontWeight: '700', marginTop: 4 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  metaCell: { backgroundColor: FSD_MATTE.well, borderRadius: 10, flex: 1, minWidth: 96, gap: 2, paddingHorizontal: 10, paddingVertical: 8 },
  metaLabel: { color: FSD_MATTE.muted, fontSize: 11 },
  metaValue: { color: FSD_MATTE.ink, fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
  quickActionsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14, paddingTop: 2 },
  quickActionBtn: { flex: 1, minHeight: 40, borderRadius: 10, backgroundColor: FSD_MATTE.well, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  quickActionPrimary: { backgroundColor: FSD_MATTE.ctaBg },
  quickActionDanger: { backgroundColor: FSD_MATTE.dangerSoft },
  quickActionPrimaryText: { color: FSD_MATTE.ctaInk, fontSize: 12.5, fontWeight: '700' },
  quickActionText: { color: FSD_MATTE.ink, fontSize: 12.5, fontWeight: '600' },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.68 },
  rowline: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingHorizontal: 14, paddingVertical: 8 },
  rowlineBorder: { borderTopWidth: 1, borderColor: FSD_MATTE.divider },
  rowIcon: { width: 28, height: 28, borderRadius: 8, backgroundColor: FSD_MATTE.well, alignItems: 'center', justifyContent: 'center' },
  rowLeft: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: FSD_MATTE.ink },
  rowSub: { fontSize: 12, lineHeight: 16, color: FSD_MATTE.muted, marginTop: 1 },
  valuePill: { backgroundColor: FSD_MATTE.well, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  rowRight: { color: FSD_MATTE.muted, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  ver: { textAlign: 'center', color: FSD_MATTE.muted, fontSize: 12, marginTop: 8, opacity: 0.72 },
  heading: { fontSize: 21, fontWeight: '700', color: FSD_MATTE.ink },
  section: { fontSize: 16, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.72)' },
  sheet: { backgroundColor: FSD_MATTE.sheet, padding: 20, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 30, alignSelf: 'center', maxWidth: 600, width: '100%' },
  sheetGroup: { backgroundColor: FSD_MATTE.well, borderRadius: 12, overflow: 'hidden' },
  sheetRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 14, paddingVertical: 8 },
  sheetRowLabel: { flex: 1, color: FSD_MATTE.ink, fontSize: 14, fontWeight: '500' },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  closeBtn: { alignItems: 'center', backgroundColor: FSD_MATTE.well, borderRadius: 999, height: 34, justifyContent: 'center', width: 34 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 6, paddingHorizontal: 18 },
});

export function ProfileScreen({
  detailsOnly = false,
  connected,
  canDisconnect,
  batteryPercent = null,
  canOpenFirmwareUpdate,
  canOpenProvisioning,
  deviceName,
  deviceType,
  firmwareVersion = '待同步',
  lastSyncLabel = '尚未同步',
  runtimeHours = null,
  deviceId = '未连接',
  robotVersion = '待同步',
  safetyLock,
  alertsEnabled,
  onConnect,
  onDisconnect,
  onOpenBleDiscovery,
  onOpenProvisioning,
  onOpenFirmwareUpdate,
  onOpenControl,
  onOpenRobotConnection,
  onOpenDataPrivacy,
  onCheckUpdate,
  onRetry,
  onToggleAlerts,
}: Props) {
  const { colors: baseColors, isDark } = useAppTheme();
  const colors = {
    ...baseColors,
    background: isDark ? FSD_MATTE.canvas : '#F5F5F5',
    surface: isDark ? FSD_MATTE.sheet : '#FFFFFF',
    ink: isDark ? FSD_MATTE.ink : '#1A1A1A',
    muted: isDark ? FSD_MATTE.muted : '#6B6B6B',
    authPrimary: isDark ? FSD_MATTE.ctaBg : '#1A1A1A',
  };
  const { fontScale, height, width } = useWindowDimensions();
  const isLandscape = width > height;
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const layoutMetrics = useMemo(
    () => getProfileLayoutMetrics({
      containerWidth: containerSize.width,
      isLandscape,
      windowHeight: containerSize.height,
      fontScale,
    }),
    [containerSize, isLandscape, fontScale],
  );
  const styles = useMemo(
    () => createStyles(colors, isDark, layoutMetrics),
    [colors, isDark, layoutMetrics],
  );
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const { width: measuredWidth, height: measuredHeight } = event.nativeEvent.layout;
    if (!Number.isFinite(measuredWidth) || measuredWidth <= 0 || !Number.isFinite(measuredHeight) || measuredHeight <= 0) return;
    const nextWidth = Math.floor(measuredWidth);
    const nextHeight = Math.floor(measuredHeight);
    setContainerSize((current) => current.width === nextWidth && current.height === nextHeight ? current : { width: nextWidth, height: nextHeight });
  }, []);
  const batteryKnown = batteryPercent != null;
  const disconnectEnabled = canDisconnect ?? connected;
  const safetyLockStatus = safetyLock == null
    ? null
    : safetyLock
      ? { label: '已开启', tone: 'on' as const }
      : { label: '已关闭', tone: 'off' as const };
  const showMoreSection = Boolean(canOpenProvisioning || canOpenFirmwareUpdate || onCheckUpdate);

  const deviceColumn = (
    <View style={styles.deviceColumn} testID="profile-device-column">
      {!detailsOnly ? (
        <View style={styles.headingBlock}>
          <Text style={styles.title}>我的设备</Text>
        </View>
      ) : null}

      <View style={styles.deviceCard} testID="profile-device-card">
        <View style={styles.deviceCardHeader}>
          <View style={[styles.onlineBadge, !connected && styles.offlineBadge]}>
            <View style={[styles.onlineDot, !connected && styles.offlineDot]} />
            <Text style={[styles.onlineText, !connected && styles.offlineText]}>{connected ? '在线' : '离线'}</Text>
          </View>
          <Pressable
            accessibilityHint="进入控制中心"
            accessibilityLabel="进入控制中心"
            accessibilityRole="button"
            accessibilityState={{ disabled: !onOpenControl }}
            disabled={!onOpenControl}
            onPress={onOpenControl}
            style={({ pressed }) => [styles.controlButton, !onOpenControl && styles.controlButtonDisabled, pressed && Boolean(onOpenControl) && styles.pressed]}
            testID="profile-control-entry"
          >
            <Ionicons color={onOpenControl ? colors.authPrimary : colors.muted} name="game-controller-outline" size={16} />
            <Text style={[styles.controlButtonText, !onOpenControl && styles.controlButtonTextDisabled]}>控制中心</Text>
            <Ionicons color={onOpenControl ? colors.authPrimary : colors.muted} name="chevron-forward" size={14} />
          </Pressable>
        </View>
        <View style={styles.deviceMain}>
          <View style={styles.deviceCopy}>
            <Text style={styles.deviceName}>{deviceName}</Text>
            <Text style={styles.deviceType}>{deviceType}</Text>
            <Text selectable style={styles.deviceMeta} testID="profile-robot-version">设备版本：{robotVersion}</Text>
            <Text selectable style={styles.deviceMeta} testID="profile-robot-id">设备地址：{deviceId}</Text>
          </View>
          <View
            accessibilityLabel={batteryKnown ? `设备电量 ${batteryPercent}%` : '设备电量待同步'}
            style={[styles.batteryRing, batteryKnown ? styles.batteryRingKnown : styles.batteryRingUnknown]}
          >
            <Text style={styles.batteryValue}>{batteryPercent == null ? '—' : `${batteryPercent}%`}</Text>
            <Text style={styles.batteryLabel}>{batteryKnown ? '电量' : '待同步'}</Text>
          </View>
        </View>
        <View style={styles.deviceStats}>
          <DeviceStat label="固件版本" styles={styles} value={firmwareVersion} />
          <DeviceStat bordered label="运行时长" styles={styles} value={runtimeHours == null ? '—' : `${runtimeHours.toFixed(1)} 小时`} />
          <DeviceStat label="上次同步" styles={styles} value={lastSyncLabel} />
        </View>
      </View>
    </View>
  );

  const controlsColumn = (
    <View style={styles.controlsColumn} testID="profile-controls-column">
      <Text style={styles.connectionSectionTitle}>连接</Text>
      <View style={styles.connectionRow}>
        <Pressable
          accessibilityHint="打开机器狗连接设置"
          accessibilityRole="button"
          onPress={onConnect}
          style={({ pressed }) => [styles.connectionPressable, pressed && styles.pressed]}
          testID="profile-connect-action"
        >
          <View style={connected ? styles.connectionPrimary : styles.connectionUnavailable}>
            <Text style={connected ? styles.connectionPrimaryText : styles.connectionUnavailableText}>{connected ? '切换连接' : '连接机器狗'}</Text>
          </View>
        </Pressable>
        <Pressable accessibilityHint="查看同步状态" accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>同步状态</Text>
        </Pressable>
        <Pressable
          accessibilityHint={disconnectEnabled ? '断开当前连接' : '当前未连接'}
          accessibilityRole="button"
          accessibilityState={{ disabled: !disconnectEnabled }}
          disabled={!disconnectEnabled}
          onPress={onDisconnect}
          style={({ pressed }) => [styles.disconnectButton, !disconnectEnabled && styles.disconnectButtonDisabled, pressed && disconnectEnabled && styles.pressed]}
          testID="profile-disconnect-action"
        >
          <Text style={[styles.disconnectText, !disconnectEnabled && styles.disconnectTextDisabled]}>{disconnectEnabled ? '断开连接' : '当前离线'}</Text>
        </Pressable>
      </View>

      <Text style={styles.settingsSectionTitle}>设置</Text>
      <View style={styles.primarySettingsCard}>
        <SettingRow icon="wifi-outline" onPress={onOpenRobotConnection} styles={styles} title="搜索机器狗 Wi-Fi" />
        {safetyLockStatus ? (
          <SettingRow
            accessibilityLabel={`安全锁，${safetyLockStatus.label}`}
            icon="lock-closed-outline"
            statusLabel={safetyLockStatus.label}
            statusTone={safetyLockStatus.tone}
            styles={styles}
            title="安全锁"
          />
        ) : null}
        <SettingRow icon="notifications-outline" onToggle={onToggleAlerts} styles={styles} title="状态提醒" value={alertsEnabled} />
      </View>
    </View>
  );

  const moreContent = (
    <View style={styles.moreContent} testID="profile-more-content">
      {showMoreSection ? (
        <>
          <SectionTitle styles={styles}>系统服务</SectionTitle>
          <View style={styles.settingsCard}>
            {canOpenProvisioning ? (
              <SettingRow icon="wifi-outline" onPress={onOpenProvisioning} styles={styles} title="网络配网" />
            ) : null}
            {canOpenFirmwareUpdate ? (
              <SettingRow icon="cloud-download-outline" onPress={onOpenFirmwareUpdate} styles={styles} title="固件更新" />
            ) : null}
            {onCheckUpdate ? (
              <SettingRow icon="arrow-up-circle-outline" onPress={onCheckUpdate} styles={styles} title="检查更新" />
            ) : null}
          </View>
        </>
      ) : null}

      <Text style={styles.sectionTitle}>设备与隐私</Text>
      <View style={styles.settingsCard}>
        <SettingRow icon="bluetooth-outline" onPress={onOpenBleDiscovery} styles={styles} title="附近蓝牙设备" />
        {!detailsOnly && onOpenDataPrivacy ? (
          <SettingRow icon="shield-checkmark-outline" onPress={onOpenDataPrivacy} styles={styles} title="数据与隐私" />
        ) : null}
      </View>

      <FontLicenseNotice />
    </View>
  );

  return (
    <View onLayout={handleLayout} style={styles.measurementViewport}>
      <View style={styles.viewport}>
        {layoutMetrics.isCompactColumns ? (
          <View style={styles.controllerColumns} testID="profile-controller-layout">
            <ScrollView contentContainerStyle={styles.controllerContent} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} style={[styles.controllerPane, { width: layoutMetrics.deviceColumnWidth }]} testID="profile-controller-primary">{deviceColumn}</ScrollView>
            <ScrollView contentContainerStyle={styles.controllerContent} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} style={[styles.controllerPane, { width: layoutMetrics.controlsColumnWidth }]} testID="profile-controller-secondary">{controlsColumn}{moreContent}</ScrollView>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} style={styles.scroll} testID="profile-scroll">
            <View style={styles.primaryGrid}>{deviceColumn}{controlsColumn}</View>
            {moreContent}
          </ScrollView>
        )}
      </View>
    </View>
  );
}

function SectionTitle({ children, styles }: { children: string; styles: Styles }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function DeviceStat({ label, value, bordered, styles }: { label: string; value: string; bordered?: boolean; styles: Styles }) {
  return <View style={[styles.deviceStat, bordered && styles.deviceStatBorder]}><Text style={styles.deviceStatLabel}>{label}</Text><Text style={styles.deviceStatValue}>{value}</Text></View>;
}

function SettingRow({
  accessibilityLabel,
  disabled = false,
  icon,
  title,
  subtitle,
  value,
  statusLabel,
  statusTone = 'unknown',
  onToggle,
  onPress,
  styles,
}: {
  accessibilityLabel?: string;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  value?: boolean;
  statusLabel?: string;
  statusTone?: 'on' | 'off' | 'unknown';
  onToggle?: () => void;
  onPress?: () => void;
  styles: Styles;
}) {
  const content = (
    <>
      {icon ? <View style={styles.settingIcon}><Ionicons color={styles.palette.iconColor} name={icon} size={16} /></View> : null}
      <View style={icon ? styles.settingCopy : styles.settingCopyNoIcon}><Text style={styles.settingTitle}>{title}</Text>{subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}</View>
      {statusLabel ? (
        <View style={[styles.statusPill, statusTone === 'on' ? styles.statusPillOn : statusTone === 'off' ? styles.statusPillOff : styles.statusPillUnknown]}>
          <Text style={[styles.statusPillText, statusTone === 'on' ? styles.statusPillTextOn : styles.statusPillTextNeutral]}>{statusLabel}</Text>
        </View>
      ) : onToggle ? (
        <Switch accessibilityHint={disabled ? subtitle : title} accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} ios_backgroundColor={styles.palette.switchOff} onValueChange={onToggle} thumbColor="#FFFFFF" trackColor={{ false: styles.palette.switchOff, true: styles.palette.switchOn }} value={value} />
      ) : <Ionicons color={styles.palette.chevronColor} name="chevron-forward" size={16} />}
    </>
  );

  if (!onPress) {
    return <View accessibilityLabel={statusLabel ? accessibilityLabel ?? `${title}，${statusLabel}` : undefined} accessibilityRole={statusLabel ? 'text' : undefined} accessible={Boolean(statusLabel)} style={styles.settingRow}>{content}</View>;
  }

  return (
    <Pressable accessibilityLabel={accessibilityLabel} accessibilityHint={disabled ? subtitle : `打开${title}`} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.settingRow, pressed && !disabled && styles.pressed]}>
      {content}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean, layout: ProfileLayoutMetrics) {
  const { controlsColumnWidth, deviceColumnWidth, gridGap, padding, usesColumns } = layout;
  const p = getProductAppearance(isDark);
  const primaryCard = isDark ? FSD_MATTE.sheet : '#FFFFFF';
  const wellBg = isDark ? FSD_MATTE.well : '#F2F2F2';
  const rowSurface = 'transparent';

  return Object.assign(StyleSheet.create({
    measurementViewport: { flex: 1, backgroundColor: colors.background },
    viewport: { flex: 1, minWidth: 0 },
    scroll: { flex: 1 },
    controllerColumns: { flex: 1, minHeight: 0, flexDirection: 'row', gap: gridGap, paddingHorizontal: padding, paddingTop: 8 },
    controllerPane: { minWidth: 0, minHeight: 0, flexGrow: 0, flexShrink: 1 },
    controllerContent: { paddingBottom: 28 },
    content: {
      minHeight: '100%',
      paddingBottom: 28,
      paddingHorizontal: padding,
      paddingTop: 8,
      width: '100%',
    },
    primaryGrid: { flexDirection: usesColumns ? 'row' : 'column', gap: gridGap },
    deviceColumn: { minWidth: 0, width: usesColumns ? deviceColumnWidth : '100%' },
    controlsColumn: { minWidth: 0, width: usesColumns ? controlsColumnWidth : '100%' },
    headingBlock: { marginBottom: 10 },
    title: { ...typography.compactTitle, color: colors.ink },
    subtitle: { ...typography.supporting, color: colors.muted, marginTop: 4 },
    deviceCard: {
      backgroundColor: primaryCard,
      borderRadius: 20,
      boxShadow: isDark ? 'none' : '0 2px 3px rgba(0,0,0,.025), 0 6px 16px rgba(0,0,0,.06)',
      minHeight: 204,
      padding: cardLayout.inset,
      width: '100%',
    },
    deviceCardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    onlineBadge: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: isDark ? FSD_MATTE.emeraldSoft : '#EBF7F0', borderRadius: 999, flexDirection: 'row', gap: 5, minHeight: 26, paddingHorizontal: 10 },
    offlineBadge: { backgroundColor: wellBg },
    onlineDot: { backgroundColor: isDark ? FSD_MATTE.emerald : '#15803D', borderRadius: 3, height: 6, width: 6 },
    offlineDot: { backgroundColor: colors.muted },
    onlineText: { ...typography.supporting, color: isDark ? FSD_MATTE.emeraldInk : '#15803D', fontWeight: '600' },
    offlineText: { color: colors.muted },
    deviceMain: { alignItems: 'center', flexDirection: 'row', marginTop: 12 },
    deviceCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
    deviceName: { ...typography.compactTitle, color: colors.ink },
    deviceType: { ...typography.supporting, color: colors.muted, marginTop: 3 },
    deviceMeta: { ...typography.supporting, color: colors.muted, marginTop: 6 },
    batteryRing: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', minHeight: 68, minWidth: 68, padding: 8 },
    batteryRingKnown: { backgroundColor: isDark ? FSD_MATTE.emeraldSoft : '#EBF7F0' },
    batteryRingUnknown: { backgroundColor: wellBg },
    batteryValue: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '600', fontVariant: ['tabular-nums'] },
    batteryLabel: { ...typography.supporting, color: colors.muted, marginTop: 1 },
    deviceStats: { flexDirection: 'row', gap: 8, marginTop: 12 },
    deviceStat: { alignItems: 'center', backgroundColor: wellBg, borderRadius: 10, flex: 1, minWidth: 0, paddingVertical: 8 },
    deviceStatBorder: {},
    deviceStatLabel: { ...typography.supporting, color: colors.muted, fontSize: 11 },
    deviceStatValue: { ...typography.label, color: colors.ink, fontSize: 13, marginTop: 3, paddingHorizontal: 4, textAlign: 'center' },
    controlButton: { alignItems: 'center', backgroundColor: wellBg, borderRadius: 10, flexDirection: 'row', gap: 5, minHeight: 38, paddingHorizontal: 10 },
    controlButtonDisabled: { backgroundColor: 'transparent' },
    controlButtonText: { ...typography.supporting, color: colors.authPrimary, fontWeight: '600' },
    controlButtonTextDisabled: { color: colors.muted },
    sectionTitle: { ...typography.label, color: colors.muted, fontSize: 12, marginBottom: 8, marginTop: 14 },
    connectionSectionTitle: { ...typography.label, color: colors.muted, fontSize: 12, marginBottom: 8 },
    settingsSectionTitle: { ...typography.label, color: colors.muted, fontSize: 12, marginBottom: 8, marginTop: 14 },
    connectionRow: { flexDirection: 'row', gap: 8 },
    pressed: { opacity: 0.68, transform: [{ scale: 0.99 }] },
    connectionPressable: { flex: 1, minHeight: 44, minWidth: 0 },
    connectionPrimary: { alignItems: 'center', backgroundColor: isDark ? FSD_MATTE.ctaBg : p.action, borderRadius: 10, justifyContent: 'center', minHeight: 44 },
    connectionPrimaryText: { ...typography.label, color: isDark ? FSD_MATTE.ctaInk : p.actionInk, fontWeight: '700' },
    connectionUnavailable: { alignItems: 'center', backgroundColor: isDark ? FSD_MATTE.ctaBg : p.action, borderRadius: 10, justifyContent: 'center', minHeight: 44 },
    connectionUnavailableText: { ...typography.label, color: isDark ? FSD_MATTE.ctaInk : p.actionInk, fontWeight: '700' },
    retryButton: { alignItems: 'center', backgroundColor: wellBg, borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 44 },
    retryText: { ...typography.supporting, color: colors.ink, fontWeight: '600' },
    disconnectButton: { alignItems: 'center', backgroundColor: isDark ? FSD_MATTE.dangerSoft : colors.dangerSurface, borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 44 },
    disconnectButtonDisabled: { backgroundColor: wellBg, opacity: 0.5 },
    disconnectText: { ...typography.supporting, color: isDark ? FSD_MATTE.dangerInk : colors.dangerText, fontWeight: '600' },
    disconnectTextDisabled: { color: colors.muted },
    primarySettingsCard: {
      backgroundColor: primaryCard,
      borderRadius: 20,
      boxShadow: isDark ? 'none' : '0 2px 3px rgba(0,0,0,.025), 0 6px 16px rgba(0,0,0,.06)',
      overflow: 'hidden',
      paddingHorizontal: 14,
    },
    settingsCard: {
      backgroundColor: primaryCard,
      borderRadius: 20,
      boxShadow: isDark ? 'none' : '0 2px 3px rgba(0,0,0,.025), 0 6px 16px rgba(0,0,0,.06)',
      overflow: 'hidden',
      paddingHorizontal: 14,
    },
    settingRow: {
      alignItems: 'center',
      backgroundColor: rowSurface,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? FSD_MATTE.divider : '#E5E5E5',
      flexDirection: 'row',
      minHeight: 48,
      paddingVertical: 8,
    },
    settingIcon: { backgroundColor: wellBg, alignItems: 'center', borderRadius: 8, height: 28, justifyContent: 'center', width: 28 },
    settingCopy: { flex: 1, marginLeft: 10, minWidth: 0, paddingRight: 8 },
    settingCopyNoIcon: { flex: 1, minWidth: 0, paddingRight: 8 },
    settingTitle: { ...typography.label, fontSize: 14.5, lineHeight: 20, fontWeight: '500', color: colors.ink },
    settingSubtitle: { ...typography.supporting, color: colors.muted, marginTop: 2 },
    statusPill: { alignItems: 'center', borderRadius: 8, justifyContent: 'center', minHeight: 24, minWidth: 48, paddingHorizontal: 8 },
    statusPillOn: { backgroundColor: isDark ? FSD_MATTE.emeraldSoft : '#EBF7F0' },
    statusPillOff: { backgroundColor: wellBg },
    statusPillUnknown: { backgroundColor: wellBg },
    statusPillText: { ...typography.supporting, fontSize: 12, fontWeight: '600' },
    statusPillTextOn: { color: isDark ? FSD_MATTE.emeraldInk : '#15803D' },
    statusPillTextNeutral: { color: colors.muted },
    moreContent: { alignSelf: 'stretch', marginTop: 4, width: '100%' },
  }), {
    palette: {
      chevronColor: isDark ? FSD_MATTE.muted : p.secondary,
      iconColor: colors.ink,
      switchOff: isDark ? FSD_MATTE.active : '#D4D4D4',
      switchOn: isDark ? FSD_MATTE.emerald : p.action,
    },
  });
}
