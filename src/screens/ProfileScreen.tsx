import { Ionicons } from '@expo/vector-icons';
import { useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { ControlPanelMotion } from '../components/ControlPanelMotion';
import { productType } from '../fonts/home';
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
import type { Device } from '../types/api';

type Props = {
  detailsOnly?: boolean;
  devices?: Device[];
  selectedDeviceId?: string;
  deviceBusy?: boolean;
  onSelectDevice?: (deviceId: string) => void;
  accountEmail?: string;
  avatarUrl?: string | null;
  connected: boolean;
  batteryPercent?: number | null;
  deviceName: string;
  deviceType: string;
  displayName?: string;
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
  onOpenAccountSecurity?: () => void;
  onEditProfile?: () => void;
  onOpenControl?: () => void;
  onOpenRobotConnection?: () => void;
  onOpenDeviceEnrollment?: () => void;
  deviceEnrollmentStatus?: 'not_started' | 'challenge_issued' | 'identity_verified' | 'completed' | 'invalidated' | 'expired';
  onOpenConnectionDiagnostics?: () => void;
  onOpenDataPrivacy?: () => void;
  remoteStatePanel?: ReactNode;
  onBindDevice?: () => void;
  onUnbindDevice?: () => void;
  onLogout?: () => void;
  onRetry: () => void;
  onToggleAlerts: () => void;
  username?: string;
};

type Styles = ReturnType<typeof createStyles>;

export function ProfileHub(props: Props & { initialDeviceOpen?: boolean }) {
  const { colors } = useAppTheme();
  const appearance = useContext(AppearanceControlContext);
  const [deviceOpen, setDeviceOpen] = useState(props.initialDeviceOpen ?? false);
  const [panel, setPanel] = useState<'notifications' | 'appearance' | 'help' | 'about' | null>(null);
  const devices = props.devices?.length ? props.devices : [{ id: props.deviceId, display_name: props.deviceName }];
  useEffect(() => {
    if (props.initialDeviceOpen) setDeviceOpen(true);
  }, [props.initialDeviceOpen]);
  if (deviceOpen) return <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ProductHeader robotName={props.deviceName} />
    <Pressable accessibilityRole="button" accessibilityLabel="返回个人中心" onPress={() => setDeviceOpen(false)} style={hubStyles.back}><Ionicons name="chevron-back" size={22} color={colors.ink} /><Text style={[hubStyles.heading, { color: colors.ink }]}>设备详情</Text></Pressable>
    <ProfileScreen {...props} detailsOnly />
  </View>;

  const rows = [
    { title: '账号与安全', action: props.onOpenAccountSecurity },
    { title: '通知设置', action: () => setPanel('notifications') },
    { title: '外观', value: appearance.preference === null ? '跟随系统' : appearance.preference === 'dark' ? '深色' : '浅色', action: () => setPanel('appearance') },
    { title: '数据与隐私', action: props.onOpenDataPrivacy },
    { title: '关于 DOSO', action: () => setPanel('about') },
  ];
  const deviceStatus = props.connected ? '已连接' : '未连接';
  const modelLabel = props.deviceType ? props.deviceType : (props.robotVersion && props.robotVersion !== '待同步' ? props.robotVersion : '');
  return <View style={{ flex: 1, backgroundColor: '#1C1C1B' }}>
    <ProductHeader robotName={props.deviceName} connected={props.connected} onDevicePress={() => setDeviceOpen(true)} />
    <ScrollView contentContainerStyle={hubStyles.page}>
      <View style={hubStyles.identity}>
        <ProfileAvatar colors={{ ...colors, surfaceStrong: '#30302F', greenDark: '#FFFFFF', line: '#343432' }} displayName={props.displayName ?? props.username} uri={props.avatarUrl} />
        <View style={{ flex: 1 }}>
          <Text style={hubStyles.name}>{props.displayName || props.username || 'DOSO 用户'}</Text>
          <Text style={hubStyles.handle}>{props.username ? '@' + props.username : props.accountEmail}</Text>
        </View>
        <Pressable testID="profile-edit-entry" accessibilityRole="button" accessibilityLabel="编辑个人资料" disabled={!props.onEditProfile} onPress={props.onEditProfile} style={hubStyles.touch}>
          <Text style={hubStyles.edit}>编辑资料</Text>
        </Pressable>
      </View>
      <Text style={hubStyles.sectionLab}>我的设备</Text>
      <View style={hubStyles.group}>
        {devices.map((device, index) => <Pressable key={device.id ?? index} accessibilityRole="button" accessibilityLabel={'管理设备 ' + device.display_name} disabled={props.deviceBusy} onPress={() => { if (device.id && device.id !== props.selectedDeviceId) props.onSelectDevice?.(device.id); setDeviceOpen(true); }} style={[hubStyles.rowline, index > 0 && hubStyles.rowlineBorder]}>
          <View style={hubStyles.rowLeft}>
            <Text style={hubStyles.rowName}>{device.display_name}</Text>
            <Text style={hubStyles.rowSub}>{(modelLabel ? modelLabel + ' · ' : '') + (device.id === props.selectedDeviceId || devices.length === 1 ? deviceStatus : ('connection_status' in device && device.connection_status === 'offline' ? '离线' : '已绑定'))}</Text>
          </View>
          <Text style={hubStyles.rowRight}>管理 ›</Text>
        </Pressable>)}
      </View>
      <Text style={hubStyles.sectionLab}>设置</Text>
      <View style={hubStyles.group}>
        {rows.map((row, index) => <Pressable key={row.title} accessibilityRole="button" accessibilityLabel={row.title} disabled={!row.action} onPress={row.action} style={[hubStyles.rowline, index > 0 && hubStyles.rowlineBorder]}>
          <Text style={[hubStyles.rowName, { flex: 1 }]}>{row.title}</Text>
          {row.value ? <Text style={hubStyles.rowRight}>{row.value}</Text> : null}
          <Text style={hubStyles.chevron}>›</Text>
        </Pressable>)}
      </View>
      {props.onLogout ? <Pressable accessibilityRole="button" onPress={props.onLogout} style={hubStyles.signout}><Text style={hubStyles.signoutText}>退出登录</Text></Pressable> : null}
      <Text style={hubStyles.ver}>v{require('../../app.json').expo.version}</Text>
    </ScrollView>
    <Modal visible={panel !== null} transparent animationType="slide" onRequestClose={() => setPanel(null)}><View style={hubStyles.backdrop}><ControlPanelMotion style={[hubStyles.sheet, { backgroundColor: '#242423' }]}>
      <View style={hubStyles.panelHeading}><Text style={[hubStyles.section, { color: '#E8E8E6' }]}>{rows.find(row => row.title === (panel === 'notifications' ? '通知设置' : panel === 'appearance' ? '外观' : '关于 DOSO'))?.title}</Text><Pressable accessibilityRole="button" accessibilityLabel="关闭设置面板" onPress={() => setPanel(null)} style={hubStyles.touch}><Ionicons name="close" size={24} color="#E8E8E6" /></Pressable></View>
      {panel === 'appearance' ? <><Text style={{ color: '#A0A09B', lineHeight: 21 }}>应用于本次使用</Text>{([{ label: '跟随系统', value: null }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }] as const).map(option => <Pressable key={option.label} accessibilityRole="radio" aria-checked={appearance.preference === option.value} accessibilityLabel={option.label} accessibilityState={{ checked: appearance.preference === option.value }} disabled={!appearance.onChange} onPress={() => appearance.onChange?.(option.value)} style={[hubStyles.rowline, hubStyles.rowlineBorder]}><Text style={{ flex: 1, color: '#E8E8E6' }}>{option.label}</Text>{appearance.preference === option.value ? <Ionicons name="checkmark" size={20} color="#E8E8E6" /> : null}</Pressable>)}</> : panel === 'notifications' ? <><View style={hubStyles.rowline}><Text style={{ flex: 1, color: '#E8E8E6' }}>状态警报偏好</Text><Switch accessibilityLabel="状态警报偏好" value={props.alertsEnabled} onValueChange={props.onToggleAlerts} thumbColor="#CBD8E0" trackColor={{ false: '#41413F', true: '#7795AA' }} /></View><Text style={{ color: '#A0A09B', lineHeight: 21 }}>此设置保存警报偏好，消息推送取决于设备与通知服务是否接通。</Text></> : panel === 'about' ? <><Text style={{ color: '#E8E8E6', marginBottom: 14 }}>DOSO robotics · v{require('../../app.json').expo.version}</Text><FontLicenseNotice /></> : null}
    </ControlPanelMotion></View></Modal>
  </View>;
}

const hubStyles = StyleSheet.create({
  page: { paddingHorizontal: 20, paddingBottom: 28, flexGrow: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 4, marginBottom: 20 },
  name: { fontSize: 20, lineHeight: 26, fontWeight: '600', color: '#FFFFFF' },
  handle: { marginTop: 2, fontSize: 13, lineHeight: 18, color: '#A0A09B' },
  edit: { color: '#E8E8E6', fontSize: 13, lineHeight: 18, fontWeight: '500' },
  touch: { minHeight: 48, justifyContent: 'center' },
  sectionLab: { marginBottom: 8, marginLeft: 4, fontSize: 13, lineHeight: 20, color: '#A0A09B', fontWeight: '500' },
  group: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 20, overflow: 'hidden', marginBottom: 12 },
  rowline: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, paddingVertical: 6 },
  rowlineBorder: { borderTopWidth: 1, borderColor: '#343432' },
  rowLeft: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, lineHeight: 22, fontWeight: '500', color: '#E8E8E6' },
  rowSub: { fontSize: 12, lineHeight: 18, color: '#A0A09B' },
  rowRight: { color: '#A0A09B', fontSize: 13, lineHeight: 18 },
  chevron: { color: '#A0A09B', fontSize: 16, lineHeight: 20 },
  signout: { marginTop: 8, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  signoutText: { color: '#A0A09B', fontSize: 14, lineHeight: 20 },
  ver: { textAlign: 'center', color: '#A0A09B', fontSize: 12, marginTop: 4 },
  heading: { fontSize: 22, fontWeight: '600', color: '#FFFFFF' },
  section: { fontSize: 16, fontWeight: '600' },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000066' },
  sheet: { padding: 22, borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 32 },
  panelHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 8, paddingHorizontal: 18 },
});


export function ProfileScreen({ detailsOnly = false, devices = [], selectedDeviceId, deviceBusy = false, onSelectDevice, accountEmail, avatarUrl, connected, batteryPercent = null, canOpenFirmwareUpdate, canOpenProvisioning, deviceName, deviceType, displayName, firmwareUpdateBlockedReason, firmwareVersion = '待同步', lastSyncLabel = '尚未同步', provisioningBlockedReason, runtimeHours = null, deviceId = '待绑定', robotVersion = '待同步', safetyLock, alertsEnabled, onConnect, onDisconnect, onOpenBleDiscovery, onOpenProvisioning, onOpenFirmwareUpdate, onOpenAccountSecurity, onEditProfile, onOpenControl, onOpenRobotConnection, onOpenDeviceEnrollment, deviceEnrollmentStatus = 'not_started', onOpenConnectionDiagnostics, onOpenDataPrivacy, onBindDevice, onUnbindDevice, onLogout, onRetry, onToggleAlerts, username, remoteStatePanel }: Props) {
  const { colors: baseColors, isDark } = useAppTheme();
  const colors = { ...baseColors, background: isDark ? '#1C1C1B' : '#F5F6F9', surface: isDark ? '#242423' : '#FFFFFF', ink: isDark ? '#E8E8E6' : '#181B20', muted: isDark ? '#92928F' : '#6D727B', authPrimary: isDark ? '#E8E8E6' : '#181B20' };
  const hasRemoteState = Boolean(remoteStatePanel);
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
          {!detailsOnly ? <Text style={[styles.title, { marginBottom: 18, marginTop: 8, fontWeight: '700' }]}>我的</Text> : null}
          {!detailsOnly ? <View style={styles.profileCard}>
            <ProfileAvatar colors={colors} displayName={displayName ?? username} key={avatarUrl ?? 'default-profile-avatar'} uri={avatarUrl} />
            <View style={styles.profileCopy}>
              <Text style={styles.profileName}>{displayName?.trim() || username?.trim() || 'DOSO 用户'}</Text>
              <Text style={styles.profileUsername}>{username ? `@${username}` : accountEmail ?? '完善用户名与头像'}</Text>
            </View>
            <Pressable
              accessibilityHint="修改头像、用户名和昵称"
              accessibilityLabel="编辑个人资料"
              accessibilityRole="button"
              disabled={!onEditProfile}
              onPress={onEditProfile}
              style={({ pressed }) => [styles.editProfileButton, pressed && styles.pressed]}
              testID="profile-edit-entry"
            >
              <Text style={styles.editProfileText}>编辑资料</Text>
            </Pressable>
          </View> : null}
          {!detailsOnly ? <View style={styles.headingBlock}>
            <Text style={styles.title}>我的设备</Text>
            <Text style={styles.subtitle}>连接与设备信息</Text>
          </View> : null}

          {devices.length ? <View style={[styles.settingsCard, styles.deviceSelectorCard]} testID="profile-device-selector">
            {devices.map(candidate => <SettingRow
              key={candidate.id}
              accessibilityLabel={`${candidate.display_name}，${candidate.id}，${candidate.id === selectedDeviceId ? '当前设备' : '切换到此设备'}`}
              disabled={deviceBusy || candidate.id === selectedDeviceId}
              onPress={onSelectDevice ? () => onSelectDevice(candidate.id) : undefined}
              statusLabel={candidate.id === selectedDeviceId ? '当前设备' : '选择'}
              statusTone={candidate.id === selectedDeviceId ? 'on' : 'unknown'}
              styles={styles}
              title={candidate.display_name}
              subtitle={candidate.id}
            />)}
          </View> : null}
          <View style={styles.deviceCard} testID="profile-device-card">
            <View style={styles.deviceCardHeader}>
              <View style={[styles.onlineBadge, (hasRemoteState || !connected) && styles.offlineBadge]}>
                <View style={[styles.onlineDot, (hasRemoteState || !connected) && styles.offlineDot]} />
                <Text style={[styles.onlineText, (hasRemoteState || !connected) && styles.offlineText]}>{hasRemoteState ? '已绑定' : connected ? '在线' : '离线'}</Text>
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
                <Text selectable style={styles.deviceMeta} testID="profile-robot-id">机器人 ID：{deviceId}</Text>
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
          {remoteStatePanel}
    </View>
  );
  const controlsColumn = (
    <View style={styles.controlsColumn} testID="profile-controls-column">
          {!hasRemoteState ? <><Text style={styles.connectionSectionTitle}>连接</Text>
          <View style={styles.connectionRow}>
            <Pressable
              accessibilityHint={connected ? '在线状态由可信设备上报，不能在此重复连接' : '查看真实连接能力的当前说明'}
              accessibilityRole="button"
              accessibilityState={{ disabled: connected }}
              disabled={connected}
              onPress={onConnect}
              style={styles.connectionPressable}
            >
              {connected ? (
                <View style={styles.connectionPrimary}>
                  <Text style={styles.connectionPrimaryText}>已连接</Text>
                </View>
              ) : (
                <View style={styles.connectionUnavailable}><Text style={styles.connectionUnavailableText}>连接说明</Text></View>
              )}
            </Pressable>
            <Pressable accessibilityHint="查看设备状态来源与同步说明" accessibilityRole="button" onPress={onRetry} style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}>
              <Text style={styles.retryText}>状态说明</Text>
            </Pressable>
            <Pressable
              accessibilityHint={connected ? '查看尚未接入的真实断开控制协议说明' : '设备当前处于离线状态'}
              accessibilityRole="button"
              accessibilityState={{ disabled: !connected }}
              disabled={!connected}
              onPress={onDisconnect}
              style={({ pressed }) => [styles.disconnectButton, pressed && connected && styles.pressed]}
            >
              <Text style={styles.disconnectText}>{connected ? '断开说明' : '当前离线'}</Text>
            </Pressable>
          </View>

          </> : null}
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
          <SettingRow icon="wifi-outline" onPress={onOpenProvisioning} styles={styles} title="网络与配网" />
          <SettingRow icon="cloud-download-outline" onPress={onOpenFirmwareUpdate} styles={styles} title="固件更新" />
          <SettingRow disabled={deviceBusy} icon="link-outline" onPress={onBindDevice} styles={styles} title="添加并绑定真实设备" />
          {deviceId !== '待绑定' ? <SettingRow disabled={deviceBusy} icon="unlink-outline" onPress={onUnbindDevice} styles={styles} title="解绑当前设备" /> : null}
          {deviceId !== '待绑定' && onOpenDeviceEnrollment ? (
            <SettingRow
              icon="shield-checkmark-outline"
              onPress={onOpenDeviceEnrollment}
              statusLabel={deviceEnrollmentStatus === 'completed' ? '已验证' : deviceEnrollmentStatus === 'challenge_issued' ? '待设备证明' : '待验证'}
              statusTone={deviceEnrollmentStatus === 'completed' ? 'on' : 'unknown'}
              styles={styles}
              title="设备身份验证"
            />
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>设备接入</Text>
        <View style={styles.settingsCard}>
            <SettingRow icon="bluetooth-outline" onPress={onOpenBleDiscovery} styles={styles} title="附近 BLE 设备" />
          {onOpenConnectionDiagnostics ? <SettingRow icon="pulse-outline" onPress={onOpenConnectionDiagnostics} styles={styles} title="连接诊断" /> : null}
        </View>

        {accountEmail ? (
          <>
            <SectionTitle styles={styles}>账户</SectionTitle>
            {onOpenDataPrivacy ? (
              <View style={styles.settingsCard}>
                <SettingRow icon="document-text-outline" onPress={onOpenDataPrivacy} styles={styles} title="数据与隐私" />
              </View>
            ) : null}
            <View style={styles.accountCard}>
              <View style={styles.accountCopy}>
                <Text style={styles.accountLabel}>当前登录邮箱</Text>
                <Text style={styles.accountEmail}>{accountEmail}</Text>
              </View>
              <Pressable accessibilityHint="管理账户身份与安全设置" accessibilityRole="button" onPress={onOpenAccountSecurity} style={({ pressed }) => [styles.securityButton, pressed && styles.pressed]}>
                <Ionicons color={colors.greenStrong} name="shield-checkmark-outline" size={17} />
                <Text style={styles.securityText}>安全</Text>
              </Pressable>
              <Pressable accessibilityHint="退出当前 DOSO 账户" accessibilityRole="button" onPress={onLogout} style={({ pressed }) => [styles.logoutButton, pressed && styles.pressed]}>
                <Ionicons color={colors.dangerText} name="log-out-outline" size={17} />
                <Text style={styles.logoutText}>退出</Text>
              </Pressable>
            </View>
          </>
        ) : null}
        <FontLicenseNotice />
      </View>
  );
  return (
    <View onLayout={handleLayout} style={styles.measurementViewport}>
      <View style={styles.viewport}>
        {layoutMetrics.isCompactColumns ? <View style={styles.controllerColumns} testID="profile-controller-layout">
          <ScrollView contentContainerStyle={styles.controllerContent} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} style={[styles.controllerPane, { width: layoutMetrics.deviceColumnWidth }]} testID="profile-controller-primary">{deviceColumn}</ScrollView>
          <ScrollView contentContainerStyle={styles.controllerContent} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} style={[styles.controllerPane, { width: layoutMetrics.controlsColumnWidth }]} testID="profile-controller-secondary">{controlsColumn}{moreContent}</ScrollView>
        </View> : <ScrollView contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} style={styles.scroll} testID="profile-scroll">
          <View style={styles.primaryGrid}>{deviceColumn}{controlsColumn}</View>
          {moreContent}
        </ScrollView>}
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

function ProfileAvatar({ colors, displayName, uri }: { colors: ThemeColors; displayName?: string; uri?: string | null }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (uri && !imageFailed) {
    return <Image accessibilityLabel="个人头像" accessibilityRole="image" onError={() => setImageFailed(true)} source={{ uri }} style={avatarStyles.image} />;
  }
  const initial = Array.from(displayName?.trim() ?? '')[0]?.toUpperCase();
  return (
    <View accessibilityLabel="默认个人头像" accessibilityRole="image" style={[avatarStyles.fallback, { backgroundColor: colors.surfaceStrong, borderColor: colors.line }]}>
      {initial ? <Text style={[avatarStyles.initial, { color: colors.greenDark }]}>{initial}</Text> : <Ionicons color={colors.greenDark} name="person-outline" size={25} />}
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  image: { backgroundColor: '#E8F1FF', borderRadius: 28, height: 56, width: 56 },
  fallback: { alignItems: 'center', borderRadius: 28, borderWidth: StyleSheet.hairlineWidth, height: 56, justifyContent: 'center', width: 56 },
  initial: { fontSize: 21, fontWeight: '600' },
});

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
    profileCard: { borderBottomWidth: isDark ? StyleSheet.hairlineWidth : 0, borderColor: '#393938', alignItems: 'center', backgroundColor: primaryCard, boxShadow: isDark ? 'none' : '0 2px 3px rgba(28,38,55,.025), 0 6px 16px rgba(28,38,55,.06)', borderRadius: isDark ? 0 : 18, flexDirection: 'row', marginBottom: 16, minHeight: 88, padding: cardLayout.inset },
    profileCopy: { flex: 1, marginLeft: 12, minWidth: 0, paddingRight: 10 },
    profileName: { ...typography.label, fontSize: 20, fontWeight: '500', color: colors.ink },
    profileUsername: { ...typography.supporting, color: colors.muted, marginTop: 2 },
    editProfileButton: { alignItems: 'center', borderRadius: 18, justifyContent: 'center', minHeight: 48, paddingHorizontal: 8 },
    editProfileText: { ...typography.supporting, color: p.blueInk },
    headingBlock: { marginBottom: 12 },
    title: { ...typography.compactTitle, color: colors.ink },
    subtitle: { ...typography.supporting, color: colors.muted, marginTop: 4 },
    deviceSelectorCard: { marginBottom: 16 },
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
    accountCard: { alignItems: 'center', backgroundColor: primaryCard, boxShadow: isDark ? 'none' : '0 2px 3px rgba(28,38,55,.025), 0 6px 16px rgba(28,38,55,.06)', borderRadius: 18, flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 72, padding: cardLayout.inset },
    accountCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
    accountLabel: { ...typography.supporting, color: colors.muted },
    accountEmail: { ...typography.label, color: colors.ink, marginTop: 4 },
    securityButton: { alignItems: 'center', borderRadius: 22, flexDirection: 'row', gap: 5, minHeight: 48, paddingHorizontal: 8 },
    securityText: { ...typography.supporting, color: p.blueInk },
    logoutButton: { alignItems: 'center', backgroundColor: isDark ? 'transparent' : colors.dangerSurface, borderWidth: isDark ? 1 : 0, borderColor: '#555551', borderRadius: 10, flexDirection: 'row', gap: 6, minHeight: 48, paddingHorizontal: 14 },
    logoutText: { ...typography.supporting, color: isDark ? colors.ink : colors.dangerText },
  }), {
    palette: {
      chevronColor: p.secondary,
      iconColor: colors.ink,
      switchOff: isDark ? '#46515C' : '#D8DEE9',
      switchOn: isDark ? '#7795AA' : p.action,
    },
  });
}
