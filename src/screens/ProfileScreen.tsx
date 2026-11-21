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
  onRetry: () => void;
  onToggleAlerts: () => void;
};

type Styles = ReturnType<typeof createStyles>;

export function ProfileHub(props: Props & { initialDeviceOpen?: boolean }) {
  const { colors } = useAppTheme();
  const appearance = useContext(AppearanceControlContext);
  const { width, height } = useWindowDimensions();
  const isWideLandscape = width > height && width >= 700;
  const [deviceOpen, setDeviceOpen] = useState(props.initialDeviceOpen ?? false);
  const [panel, setPanel] = useState<'notifications' | 'appearance' | 'about' | null>(null);
  useEffect(() => {
    if (props.initialDeviceOpen) setDeviceOpen(true);
  }, [props.initialDeviceOpen]);

  if (deviceOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <ProductHeader robotName={props.deviceName} connected={props.connected} />
        <Pressable accessibilityRole="button" accessibilityLabel="返回设置" onPress={() => setDeviceOpen(false)} style={hubStyles.back}>
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
          <Text style={[hubStyles.heading, { color: colors.ink }]}>设备详情</Text>
        </Pressable>
        <ProfileScreen {...props} detailsOnly />
      </View>
    );
  }

  const rows = [
    {
      title: '通知设置',
      subtitle: '状态告警与端侧提示偏好',
      value: props.alertsEnabled ? '已开启' : '已关闭',
      icon: 'notifications-outline' as const,
      action: () => setPanel('notifications'),
    },
    {
      title: '外观',
      subtitle: '控制台配色与昼夜显示风格',
      value: appearance.preference === null ? '跟随系统' : appearance.preference === 'dark' ? '深色' : '浅色',
      icon: 'color-palette-outline' as const,
      action: () => setPanel('appearance'),
    },
    ...(props.onOpenDataPrivacy ? [{
      title: '数据与隐私',
      subtitle: '本机地址存储、BLE 扫描与隐私说明',
      value: undefined,
      icon: 'shield-checkmark-outline' as const,
      action: props.onOpenDataPrivacy,
    }] : []),
    {
      title: '关于 DOSO',
      subtitle: '通信协议版本、字库许可与客户端信息',
      value: `v${require('../../app.json').expo.version}`,
      icon: 'information-circle-outline' as const,
      action: () => setPanel('about'),
    },
  ];
  const deviceStatus = props.connected ? '已连接' : '未连接';
  const modelLabel = props.deviceType ? props.deviceType : (props.robotVersion && props.robotVersion !== '待同步' ? props.robotVersion : '');
  const disconnectEnabled = props.canDisconnect ?? props.connected;

  return (
    <View style={hubStyles.shell}>
      <ProductHeader robotName={props.deviceName} connected={props.connected} onDevicePress={() => setDeviceOpen(true)} />
      <ScrollView contentContainerStyle={hubStyles.page} showsVerticalScrollIndicator={false}>
        <View style={hubStyles.container}>
          <View style={hubStyles.topTitleBar}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text accessibilityRole="header" style={hubStyles.heading}>设置</Text>
              <Text style={hubStyles.subHeading}>设备连接、工作台偏好与协议信息</Text>
            </View>
            {props.onOpenControl ? (
              <Pressable
                accessibilityLabel="返回操控画面"
                accessibilityRole="button"
                onPress={props.onOpenControl}
                style={({ pressed }) => [hubStyles.returnControlBtn, pressed && hubStyles.pressed]}
                testID="settings-return-control"
              >
                <Ionicons color="#FFFFFF" name="game-controller-outline" size={16} />
                <Text style={hubStyles.returnControlText}>返回操控画面</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={[hubStyles.grid, isWideLandscape && hubStyles.gridLandscape]}>
            <View style={hubStyles.col}>
              <Text style={hubStyles.sectionLab}>我的设备与连接</Text>
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
                      <Text style={[hubStyles.statusBadgeText, props.connected ? hubStyles.statusBadgeTextOnline : null]}>{deviceStatus}</Text>
                    </View>
                    <Text style={hubStyles.rowRight}>设备详情 ›</Text>
                  </View>
                  <Text style={hubStyles.deviceTitle}>{props.deviceName}</Text>
                  {modelLabel ? <Text style={hubStyles.rowSub}>{modelLabel}</Text> : null}
                  <View style={hubStyles.metaGrid}>
                    <View style={hubStyles.metaCell}>
                      <Text style={hubStyles.metaLabel}>通信地址</Text>
                      <Text selectable style={hubStyles.metaValue}>{props.deviceId ?? '未连接'}</Text>
                    </View>
                    <View style={hubStyles.metaCell}>
                      <Text style={hubStyles.metaLabel}>机器人版本</Text>
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
                    <Ionicons color="#FFFFFF" name="wifi-outline" size={15} />
                    <Text style={hubStyles.quickActionPrimaryText}>连接配置</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="扫描附近 BLE 设备"
                    accessibilityRole="button"
                    onPress={props.onOpenBleDiscovery}
                    style={({ pressed }) => [hubStyles.quickActionBtn, pressed && hubStyles.pressed]}
                    testID="settings-open-ble"
                  >
                    <Ionicons color="#E8EEE9" name="bluetooth-outline" size={15} />
                    <Text style={hubStyles.quickActionText}>BLE 扫描</Text>
                  </Pressable>
                  <Pressable
                    accessibilityLabel="断开当前机器狗连接"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !disconnectEnabled }}
                    disabled={!disconnectEnabled}
                    onPress={props.onDisconnect}
                    style={({ pressed }) => [hubStyles.quickActionBtn, !disconnectEnabled && hubStyles.disabled, pressed && disconnectEnabled && hubStyles.pressed]}
                    testID="settings-disconnect"
                  >
                    <Ionicons color={disconnectEnabled ? '#FCA5A5' : '#808783'} name="close-circle-outline" size={15} />
                    <Text style={[hubStyles.quickActionText, disconnectEnabled && { color: '#FCA5A5' }]}>断开连接</Text>
                  </Pressable>
                </View>
              </View>
            </View>

            <View style={hubStyles.col}>
              <Text style={hubStyles.sectionLab}>系统偏好与协议说明</Text>
              <View style={hubStyles.group}>
                {rows.map((row, index) => (
                  <Pressable key={row.title} accessibilityRole="button" accessibilityLabel={row.title} disabled={!row.action} onPress={row.action} style={({ pressed }) => [hubStyles.rowline, index > 0 && hubStyles.rowlineBorder, pressed && hubStyles.pressed]}>
                    <View style={hubStyles.rowIcon}><Ionicons color="#93C5FD" name={row.icon} size={17} /></View>
                    <View style={hubStyles.rowLeft}>
                      <Text style={hubStyles.rowName}>{row.title}</Text>
                      <Text style={hubStyles.rowSub}>{row.subtitle}</Text>
                    </View>
                    {row.value ? <View style={hubStyles.valuePill}><Text style={hubStyles.rowRight}>{row.value}</Text></View> : null}
                    <Ionicons color="#8B9490" name="chevron-forward" size={16} />
                  </Pressable>
                ))}
              </View>

              <View style={hubStyles.protocolSummaryCard}>
                <Text style={hubStyles.protocolSummaryTitle}>通信架构概览</Text>
                <Text style={hubStyles.protocolSummaryText}>控制遥测：Brainstem gRPC v2.2 (:13145 mTLS / 局域网) · 图传：WebRTC WHEP / MuJoCo 1080p 仿真流 · 遥控：Skydroid G20</Text>
              </View>
            </View>
          </View>

          <Text style={hubStyles.ver}>DOSO Robotics · v{require('../../app.json').expo.version}</Text>
        </View>
      </ScrollView>
      <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={() => setPanel(null)}>
        <View style={hubStyles.backdrop}>
          <ControlPanelMotion style={[hubStyles.sheet, { backgroundColor: '#171D1B', borderColor: 'rgba(232,238,233,0.16)', borderWidth: 1 }]}>
            <View style={hubStyles.panelHeading}>
              <Text style={[hubStyles.section, { color: '#EDF2EE' }]}>
                {panel === 'notifications' ? '通知设置' : panel === 'appearance' ? '外观' : '关于 DOSO'}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="关闭设置面板" onPress={() => setPanel(null)} style={hubStyles.touch}>
                <Ionicons name="close" size={24} color="#EDF2EE" />
              </Pressable>
            </View>
            {panel === 'appearance' ? (
              <>
                <Text style={{ color: '#9AA39E', lineHeight: 21, marginBottom: 8 }}>应用于本次使用</Text>
                {([{ label: '跟随系统', value: null }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }] as const).map(option => (
                  <Pressable key={option.label} accessibilityRole="radio" aria-checked={appearance.preference === option.value} accessibilityLabel={option.label} accessibilityState={{ checked: appearance.preference === option.value }} disabled={!appearance.onChange} onPress={() => appearance.onChange?.(option.value)} style={[hubStyles.rowline, hubStyles.rowlineBorder]}>
                    <Text style={{ flex: 1, color: '#EDF2EE' }}>{option.label}</Text>
                    {appearance.preference === option.value ? <Ionicons name="checkmark" size={20} color="#3B6EF6" /> : null}
                  </Pressable>
                ))}
              </>
            ) : panel === 'notifications' ? (
              <>
                <View style={hubStyles.rowline}>
                  <Text style={{ flex: 1, color: '#EDF2EE' }}>状态警报偏好</Text>
                  <Switch accessibilityLabel="状态警报偏好" value={props.alertsEnabled} onValueChange={props.onToggleAlerts} thumbColor="#FFFFFF" trackColor={{ false: '#3A4240', true: '#3B6EF6' }} />
                </View>
                <Text style={{ color: '#9AA39E', lineHeight: 21, marginTop: 6 }}>此设置仅保存本机警报偏好；真实通知服务尚未接入。</Text>
              </>
            ) : panel === 'about' ? (
              <>
                <Text style={{ color: '#EDF2EE', marginBottom: 14 }}>DOSO robotics · v{require('../../app.json').expo.version}</Text>
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
  shell: { flex: 1, backgroundColor: '#121615' },
  page: { paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 },
  container: { alignSelf: 'center', maxWidth: 1080, width: '100%' },
  topTitleBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6, marginBottom: 14 },
  subHeading: { color: '#9AA39E', fontSize: 13, marginTop: 2 },
  returnControlBtn: { alignItems: 'center', backgroundColor: '#3B6EF6', borderColor: 'rgba(147,197,253,0.58)', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 6, minHeight: 38, paddingHorizontal: 14 },
  returnControlText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  grid: { flexDirection: 'column', gap: 16 },
  gridLandscape: { flexDirection: 'row', alignItems: 'flex-start', gap: 16 },
  col: { flex: 1, minWidth: 0 },
  touch: { minHeight: 48, justifyContent: 'center' },
  sectionLab: { marginBottom: 8, marginLeft: 4, fontSize: 13, lineHeight: 20, color: '#9AA39E', fontWeight: '600' },
  group: { backgroundColor: 'rgba(26,32,30,0.92)', borderColor: 'rgba(232,238,233,0.14)', borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  deviceHeroRow: { padding: 16, gap: 6 },
  deviceTopLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  statusBadge: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 12, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeOnline: { backgroundColor: 'rgba(34,197,94,0.16)' },
  statusDot: { backgroundColor: '#868984', borderRadius: 3.5, height: 7, width: 7 },
  statusDotOnline: { backgroundColor: '#22C55E' },
  statusBadgeText: { color: '#9AA39E', fontSize: 12, fontWeight: '600' },
  statusBadgeTextOnline: { color: '#86EFAC' },
  deviceTitle: { color: '#EDF2EE', fontSize: 19, fontWeight: '700', marginTop: 4 },
  metaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderColor: 'rgba(232,238,233,0.1)' },
  metaCell: { flex: 1, minWidth: 100, gap: 2 },
  metaLabel: { color: '#8B9490', fontSize: 11 },
  metaValue: { color: '#EDF2EE', fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  quickActionsRow: { flexDirection: 'row', gap: 8, padding: 12, borderTopWidth: 1, borderColor: 'rgba(232,238,233,0.1)', backgroundColor: 'rgba(16,20,19,0.5)' },
  quickActionBtn: { flex: 1, minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(232,238,233,0.14)', backgroundColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 8 },
  quickActionPrimary: { backgroundColor: '#3B6EF6', borderColor: 'rgba(147,197,253,0.58)' },
  quickActionPrimaryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
  quickActionText: { color: '#E8EEE9', fontSize: 12, fontWeight: '600' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  rowline: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingHorizontal: 14, paddingVertical: 8 },
  rowlineBorder: { borderTopWidth: 1, borderColor: 'rgba(232,238,233,0.1)' },
  rowIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(59,110,246,0.16)', alignItems: 'center', justifyContent: 'center' },
  rowLeft: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: '#EDF2EE' },
  rowSub: { fontSize: 12, lineHeight: 17, color: '#9AA39E', marginTop: 1 },
  valuePill: { backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  rowRight: { color: '#B4BDB8', fontSize: 12, lineHeight: 16, fontWeight: '500' },
  chevron: { color: '#9AA39E', fontSize: 16, lineHeight: 20 },
  protocolSummaryCard: { backgroundColor: 'rgba(26,32,30,0.68)', borderColor: 'rgba(232,238,233,0.12)', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, gap: 4 },
  protocolSummaryTitle: { color: '#93C5FD', fontSize: 12, fontWeight: '700' },
  protocolSummaryText: { color: '#9AA39E', fontSize: 12, lineHeight: 18 },
  ver: { textAlign: 'center', color: '#808783', fontSize: 12, marginTop: 10 },
  heading: { fontSize: 22, fontWeight: '700', color: '#FFFFFF' },
  section: { fontSize: 16, fontWeight: '700' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000088' },
  sheet: { padding: 22, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 32, alignSelf: 'center', maxWidth: 640, width: '100%' },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 8, paddingHorizontal: 18 },
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
  firmwareUpdateBlockedReason,
  firmwareVersion = '待同步',
  lastSyncLabel = '尚未同步',
  provisioningBlockedReason,
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
  onRetry,
  onToggleAlerts,
}: Props) {
  const { colors: baseColors, isDark } = useAppTheme();
  const colors = { ...baseColors, background: isDark ? '#1C1C1B' : '#F5F6F9', surface: isDark ? '#242423' : '#FFFFFF', ink: isDark ? '#E8E8E6' : '#181B20', muted: isDark ? '#92928F' : '#6D727B', authPrimary: isDark ? '#E8E8E6' : '#181B20' };
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
  const provisioningReason = canOpenProvisioning ? '扫描、配对并管理真实设备' : provisioningBlockedReason ?? '真实配网尚未接入';
  const firmwareReason = canOpenFirmwareUpdate ? '检查并安装机器人固件' : firmwareUpdateBlockedReason ?? '真实固件升级尚未接入';
  const disconnectEnabled = canDisconnect ?? connected;
  const safetyLockStatus = safetyLock == null
    ? {
      label: connected ? '待同步' : '未连接',
      subtitle: connected ? '状态待同步，只读' : '设备未连接，状态待同步',
      tone: 'unknown' as const,
    }
    : safetyLock
      ? { label: '已开启', subtitle: '记录状态，只读', tone: 'on' as const }
      : { label: '已关闭', subtitle: '记录状态，只读', tone: 'off' as const };

  const deviceColumn = (
    <View style={styles.deviceColumn} testID="profile-device-column">
      {!detailsOnly ? (
        <View style={styles.headingBlock}>
          <Text style={styles.title}>我的设备</Text>
          <Text style={styles.subtitle}>连接与设备信息</Text>
        </View>
      ) : null}

      <View style={styles.deviceCard} testID="profile-device-card">
        <View style={styles.deviceCardHeader}>
          <View style={[styles.onlineBadge, !connected && styles.offlineBadge]}>
            <View style={[styles.onlineDot, !connected && styles.offlineDot]} />
            <Text style={[styles.onlineText, !connected && styles.offlineText]}>{connected ? '在线' : '离线'}</Text>
          </View>
          <Pressable
            accessibilityHint="进入机器人控制中心；是否可执行由设备连接与控制权限决定"
            accessibilityLabel="进入控制中心"
            accessibilityRole="button"
            accessibilityState={{ disabled: !onOpenControl }}
            disabled={!onOpenControl}
            onPress={onOpenControl}
            style={({ pressed }) => [styles.controlButton, !onOpenControl && styles.controlButtonDisabled, pressed && Boolean(onOpenControl) && styles.pressed]}
            testID="profile-control-entry"
          >
            <Ionicons color={onOpenControl ? colors.authPrimary : colors.muted} name="game-controller-outline" size={17} />
            <Text style={[styles.controlButtonText, !onOpenControl && styles.controlButtonTextDisabled]}>控制中心</Text>
            <Ionicons color={onOpenControl ? colors.authPrimary : colors.muted} name="chevron-forward" size={15} />
          </Pressable>
        </View>
        <View style={styles.deviceMain}>
          <View style={styles.deviceCopy}>
            <Text style={styles.deviceName}>{deviceName}</Text>
            <Text style={styles.deviceType}>{deviceType}</Text>
            <Text selectable style={styles.deviceMeta} testID="profile-robot-version">机器人版本：{robotVersion}</Text>
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
          accessibilityHint="打开机器狗连接设置与地址配置"
          accessibilityRole="button"
          onPress={onConnect}
          style={({ pressed }) => [styles.connectionPressable, pressed && styles.pressed]}
          testID="profile-connect-action"
        >
          <View style={connected ? styles.connectionPrimary : styles.connectionUnavailable}>
            <Text style={connected ? styles.connectionPrimaryText : styles.connectionUnavailableText}>{connected ? '切换连接' : '连接机器狗'}</Text>
          </View>
        </Pressable>
        <Pressable accessibilityHint="查看设备状态来源与同步说明" accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
          <Text style={styles.retryText}>状态说明</Text>
        </Pressable>
        <Pressable
          accessibilityHint={disconnectEnabled ? '断开当前连接并清除自动重连记录' : '当前未建立连接'}
          accessibilityRole="button"
          accessibilityState={{ disabled: !disconnectEnabled }}
          disabled={!disconnectEnabled}
          onPress={onDisconnect}
          style={({ pressed }) => [styles.disconnectButton, pressed && disconnectEnabled && styles.pressed]}
          testID="profile-disconnect-action"
        >
          <Text style={styles.disconnectText}>{disconnectEnabled ? '断开连接' : '当前离线'}</Text>
        </Pressable>
      </View>

      <Text style={styles.settingsSectionTitle}>设置</Text>
      <View style={styles.primarySettingsCard}>
        <SettingRow icon="wifi-outline" onPress={onOpenRobotConnection} styles={styles} title="搜索机器狗 Wi-Fi" />
        <SettingRow
          accessibilityLabel={`安全锁，${safetyLockStatus.label}。${safetyLockStatus.subtitle}`}
          icon="lock-closed-outline"
          statusLabel={safetyLockStatus.label}
          statusTone={safetyLockStatus.tone}
          styles={styles}
          subtitle={safetyLockStatus.subtitle}
          title="安全锁"
        />
        <SettingRow icon="notifications-outline" onToggle={onToggleAlerts} styles={styles} title="状态警报" value={alertsEnabled} />
      </View>
    </View>
  );

  const moreContent = (
    <View style={styles.moreContent} testID="profile-more-content">
      <SectionTitle styles={styles}>更多设置</SectionTitle>
      <View style={styles.settingsCard}>
        <SettingRow icon="wifi-outline" onPress={onOpenProvisioning} styles={styles} subtitle={provisioningReason} title="网络与配网" />
        <SettingRow icon="cloud-download-outline" onPress={onOpenFirmwareUpdate} styles={styles} subtitle={firmwareReason} title="固件更新" />
      </View>

      <Text style={styles.sectionTitle}>设备接入</Text>
      <View style={styles.settingsCard}>
        <SettingRow icon="bluetooth-outline" onPress={onOpenBleDiscovery} styles={styles} title="附近 BLE 设备" />
        {!detailsOnly && onOpenDataPrivacy ? (
          <SettingRow icon="document-text-outline" onPress={onOpenDataPrivacy} styles={styles} title="数据与隐私" />
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

function SettingRow({ accessibilityLabel, disabled = false, icon, title, subtitle, value, statusLabel, statusTone = 'unknown', onToggle, onPress, styles }: { accessibilityLabel?: string; disabled?: boolean; icon?: keyof typeof Ionicons.glyphMap; title: string; subtitle?: string; value?: boolean; statusLabel?: string; statusTone?: 'on' | 'off' | 'unknown'; onToggle?: () => void; onPress?: () => void; styles: Styles }) {
  const content = (
    <>
      {icon ? <View style={styles.settingIcon}><Ionicons color={styles.palette.iconColor} name={icon} size={17} /></View> : null}
      <View style={icon ? styles.settingCopy : styles.settingCopyNoIcon}><Text style={styles.settingTitle}>{title}</Text>{subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}</View>
      {statusLabel ? (
        <View style={[styles.statusPill, statusTone === 'on' ? styles.statusPillOn : statusTone === 'off' ? styles.statusPillOff : styles.statusPillUnknown]}>
          <Text style={[styles.statusPillText, statusTone === 'on' ? styles.statusPillTextOn : styles.statusPillTextNeutral]}>{statusLabel}</Text>
        </View>
      ) : onToggle ? (
        <Switch accessibilityHint={disabled ? subtitle : `${title}只是本机偏好，通知服务尚未接入`} accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled} ios_backgroundColor={styles.palette.switchOff} onValueChange={onToggle} thumbColor="#FFFFFF" trackColor={{ false: styles.palette.switchOff, true: styles.palette.switchOn }} value={value} />
      ) : <Ionicons color={styles.palette.chevronColor} name="chevron-forward" size={16} />}
    </>
  );

  if (!onPress) {
    return <View accessibilityLabel={statusLabel ? accessibilityLabel ?? `${title}，${statusLabel}。${subtitle ?? ''}` : undefined} accessibilityRole={statusLabel ? 'text' : undefined} accessible={Boolean(statusLabel)} style={styles.settingRow}>{content}</View>;
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
  const primaryCard = isDark ? 'transparent' : '#FFFFFF';
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
    headingBlock: { marginBottom: 12 },
    title: { ...typography.compactTitle, color: colors.ink },
    subtitle: { ...typography.supporting, color: colors.muted, marginTop: 4 },
    deviceCard: { borderBottomWidth: isDark ? StyleSheet.hairlineWidth : 0, borderColor: '#393938', backgroundColor: primaryCard, boxShadow: isDark ? 'none' : '0 2px 3px rgba(28,38,55,.025), 0 6px 16px rgba(28,38,55,.06)', borderRadius: isDark ? 0 : 18, minHeight: 220, padding: cardLayout.inset, width: '100%' },
    deviceCardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
    onlineBadge: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 16, flexDirection: 'row', gap: 4, minHeight: 28 },
    offlineBadge: { backgroundColor: 'transparent' },
    onlineDot: { backgroundColor: p.blueInk, borderRadius: 3, height: 5, width: 5 },
    offlineDot: { backgroundColor: colors.muted },
    onlineText: { ...typography.supporting, color: p.blueInk },
    offlineText: { color: colors.inkSoft },
    deviceMain: { alignItems: 'center', flexDirection: 'row', marginTop: 12 },
    deviceCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
    deviceName: { ...typography.compactTitle, color: colors.ink },
    deviceType: { ...typography.supporting, color: colors.muted, marginTop: 4 },
    deviceMeta: { ...typography.supporting, color: colors.muted, marginTop: 8 },
    batteryRing: { alignItems: 'center', borderRadius: 16, justifyContent: 'center', minHeight: 72, minWidth: 72, padding: 8 },
    batteryRingKnown: { backgroundColor: isDark ? '#273646' : '#F1F6FC' },
    batteryRingUnknown: { backgroundColor: isDark ? '#242423' : '#F4F5F7' },
    batteryValue: { color: colors.ink, fontSize: 18, lineHeight: 24, fontWeight: '500', fontVariant: ['tabular-nums'] },
    batteryLabel: { ...typography.supporting, color: colors.muted, marginTop: 1 },
    deviceStats: { flexDirection: 'row', marginTop: 12, paddingTop: 8 },
    deviceStat: { alignItems: 'center', flex: 1, minWidth: 0 },
    deviceStatBorder: {},
    deviceStatLabel: { ...typography.supporting, color: colors.muted },
    deviceStatValue: { ...typography.label, color: colors.ink, marginTop: 4, paddingHorizontal: 4, textAlign: 'center' },
    controlButton: { alignItems: 'center', borderRadius: 18, flexDirection: 'row', gap: 6, minHeight: 48, paddingHorizontal: 8 },
    controlButtonDisabled: { backgroundColor: 'transparent' },
    controlButtonText: { ...typography.supporting, color: p.blueInk },
    controlButtonTextDisabled: { color: colors.muted },
    sectionTitle: { ...typography.label, color: colors.ink, marginBottom: 12, marginTop: 16 },
    connectionSectionTitle: { ...typography.label, color: colors.ink, marginBottom: 12 },
    settingsSectionTitle: { ...typography.label, color: colors.ink, marginBottom: 12, marginTop: 16 },
    connectionRow: { flexDirection: 'row', gap: 10 },
    pressed: { opacity: 0.68, transform: [{ scale: 0.99 }] },
    connectionPressable: { flex: 1, minHeight: 48, minWidth: 0 },
    connectionPrimary: { alignItems: 'center', backgroundColor: p.action, borderRadius: 22, justifyContent: 'center', minHeight: 48 },
    connectionPrimaryText: { ...typography.label, color: p.actionInk },
    connectionUnavailable: { alignItems: 'center', backgroundColor: isDark ? '#242423' : colors.surface, borderRadius: 10, justifyContent: 'center', minHeight: 48 },
    connectionUnavailableText: { ...typography.supporting, color: colors.inkSoft },
    retryButton: { alignItems: 'center', borderRadius: 22, flex: 1, justifyContent: 'center', minHeight: 48 },
    retryText: { ...typography.supporting, color: colors.muted },
    disconnectButton: { alignItems: 'center', backgroundColor: isDark ? 'transparent' : colors.dangerSurface, borderRadius: 22, flex: 1, justifyContent: 'center', minHeight: 48 },
    disconnectText: { ...typography.supporting, color: colors.dangerText },
    primarySettingsCard: { borderTopWidth: isDark ? StyleSheet.hairlineWidth : 0, borderColor: '#393938', backgroundColor: primaryCard, boxShadow: isDark ? 'none' : '0 2px 3px rgba(28,38,55,.025), 0 6px 16px rgba(28,38,55,.06)', borderRadius: isDark ? 0 : 18, gap: isDark ? 0 : 8, padding: isDark ? 0 : cardLayout.inset },
    settingsCard: { borderTopWidth: isDark ? StyleSheet.hairlineWidth : 0, borderColor: '#393938', backgroundColor: primaryCard, boxShadow: isDark ? 'none' : '0 2px 3px rgba(28,38,55,.025), 0 6px 16px rgba(28,38,55,.06)', borderRadius: isDark ? 0 : 18, gap: isDark ? 0 : 8, padding: isDark ? 0 : cardLayout.inset },
    settingRow: { borderBottomWidth: isDark ? StyleSheet.hairlineWidth : 0, borderColor: '#343432', alignItems: 'center', backgroundColor: rowSurface, borderRadius: isDark ? 0 : 20, flexDirection: 'row', minHeight: 68, paddingVertical: 8 },
    settingIcon: { backgroundColor: isDark ? 'transparent' : '#F1F3F7', alignItems: 'center', borderRadius: 10, height: 32, justifyContent: 'center', width: 32 },
    settingCopy: { flex: 1, marginLeft: 10, minWidth: 0, paddingRight: 8 },
    settingCopyNoIcon: { flex: 1, minWidth: 0, paddingRight: 8 },
    settingTitle: { ...typography.label, fontSize: 16, lineHeight: 22, fontWeight: '400', color: colors.ink },
    settingSubtitle: { ...typography.supporting, color: colors.muted, marginTop: 2 },
    statusPill: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', minHeight: 28, minWidth: 52, paddingHorizontal: 4 },
    statusPillOn: { backgroundColor: 'transparent' },
    statusPillOff: { backgroundColor: 'transparent' },
    statusPillUnknown: { backgroundColor: 'transparent' },
    statusPillText: { ...typography.supporting },
    statusPillTextOn: { color: p.blueInk },
    statusPillTextNeutral: { color: colors.inkSoft },
    moreContent: { alignSelf: 'stretch', marginTop: 8, width: '100%' },
  }), {
    palette: {
      chevronColor: p.secondary,
      iconColor: colors.ink,
      switchOff: isDark ? '#46515C' : '#D8DEE9',
      switchOn: isDark ? '#7795AA' : p.action,
    },
  });
}
