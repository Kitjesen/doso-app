import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { Text } from '../components/AppText';
import type { LayoutChangeEvent } from 'react-native';
import { getProfileLayoutMetrics } from './profileLayout';
import type { ProfileLayoutMetrics } from './profileLayout';
import { useAppTheme } from '../theme';
import type { ThemeColors } from '../theme';
import { FontLicenseNotice } from '../components/FontLicenseNotice';
import { cardLayout, getProductAppearance } from '../appearance';
import { typography } from '../typography';

type Props = {
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
  serialNumber?: string;
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
  onBindDevice?: () => void;
  onUnbindDevice?: () => void;
  onLogout?: () => void;
  onRetry: () => void;
  onToggleAlerts: () => void;
  username?: string;
};

type Styles = ReturnType<typeof createStyles>;

export function ProfileScreen({ accountEmail, avatarUrl, connected, batteryPercent = null, canOpenFirmwareUpdate, canOpenProvisioning, deviceName, deviceType, displayName, firmwareUpdateBlockedReason, firmwareVersion = '待同步', lastSyncLabel = '尚未同步', provisioningBlockedReason, runtimeHours = null, serialNumber = '待绑定', safetyLock, alertsEnabled, onConnect, onDisconnect, onOpenBleDiscovery, onOpenProvisioning, onOpenFirmwareUpdate, onOpenAccountSecurity, onEditProfile, onOpenControl, onOpenRobotConnection, onOpenDeviceEnrollment, deviceEnrollmentStatus = 'not_started', onOpenConnectionDiagnostics, onOpenDataPrivacy, onBindDevice, onUnbindDevice, onLogout, onRetry, onToggleAlerts, username }: Props) {
  const { colors, isDark } = useAppTheme();
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
          <View style={styles.profileCard}>
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
          </View>
          <View style={styles.headingBlock}>
            <Text style={styles.title}>我的设备</Text>
            <Text style={styles.subtitle}>管理 {deviceName} 的连接与设备设置</Text>
          </View>

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
            {onOpenRobotConnection ? <SettingRow icon="add-circle-outline" onPress={onOpenRobotConnection} styles={styles} title="IP 连接 / 添加机器狗" subtitle="输入机器狗 IP，检查真实连接状态" /> : null}
            <View style={styles.deviceMain}>
              <View style={styles.deviceCopy}>
                <Text style={styles.deviceName}>{deviceName}</Text>
                <Text style={styles.deviceType}>{deviceType}</Text>
                <Text style={styles.serial}><Ionicons name="reader-outline" size={11} />  序列号：{serialNumber}</Text>
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
              <DeviceStat label="固件" styles={styles} value={firmwareVersion} />
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

          <Text style={styles.settingsSectionTitle}>设置</Text>
          <View style={styles.primarySettingsCard}>
            <SettingRow icon="git-network-outline" onPress={onOpenProvisioning} styles={styles} title="连接管理" subtitle={provisioningReason} />
            <SettingRow
              accessibilityLabel={`安全锁，${safetyLockStatus.label}。${safetyLockStatus.subtitle}`}
              icon="lock-closed-outline"
              statusLabel={safetyLockStatus.label}
              statusTone={safetyLockStatus.tone}
              styles={styles}
              subtitle={safetyLockStatus.subtitle}
              title="安全锁"
            />
            <SettingRow icon="notifications-outline" onToggle={onToggleAlerts} styles={styles} subtitle={alertsEnabled ? '偏好已开启，通知服务待接入' : '偏好已关闭，通知服务待接入'} title="状态警报" value={alertsEnabled} />
          </View>
    </View>
  );
  const moreContent = (
      <View style={styles.moreContent} testID="profile-more-content">
        <SectionTitle styles={styles}>更多设置</SectionTitle>
        <View style={styles.settingsCard}>
          <SettingRow icon="wifi-outline" onPress={onOpenProvisioning} styles={styles} title="网络与配网" subtitle={canOpenProvisioning ? '真实设备安全配网' : provisioningBlockedReason ?? '真实配网尚未接入'} />
          <SettingRow icon="cloud-download-outline" onPress={onOpenFirmwareUpdate} styles={styles} title="固件更新" subtitle={canOpenFirmwareUpdate ? '检查生产签名固件' : firmwareUpdateBlockedReason ?? '生产固件更新尚未接入'} />
          {serialNumber === '待绑定'
            ? <SettingRow icon="link-outline" onPress={onBindDevice} styles={styles} title="绑定真实设备" subtitle="当前版本每个账户绑定一台机器人" />
            : <SettingRow icon="unlink-outline" onPress={onUnbindDevice} styles={styles} title="解绑当前设备" subtitle="解绑后设备将返回待认领状态" />}
          {serialNumber !== '待绑定' && onOpenDeviceEnrollment ? (
            <SettingRow
              icon="shield-checkmark-outline"
              onPress={onOpenDeviceEnrollment}
              statusLabel={deviceEnrollmentStatus === 'completed' ? '已验证' : deviceEnrollmentStatus === 'challenge_issued' ? '待设备证明' : '待验证'}
              statusTone={deviceEnrollmentStatus === 'completed' ? 'on' : 'unknown'}
              styles={styles}
              subtitle={deviceEnrollmentStatus === 'completed' ? '制造身份与在线确认已完成' : '账户归属已绑定，仍需机器狗身份签名'}
              title="设备身份验证"
            />
          ) : null}
        </View>

        <Text style={styles.sectionTitle}>设备接入</Text>
        <View style={styles.settingsCard}>
            <SettingRow icon="bluetooth-outline" onPress={onOpenBleDiscovery} styles={styles} title="附近 BLE 设备" subtitle="连接并发现服务，设备身份和配网需协议支持" />
          {onOpenConnectionDiagnostics ? <SettingRow icon="pulse-outline" onPress={onOpenConnectionDiagnostics} styles={styles} title="连接诊断" subtitle="检查云服务与 Brainstem 只读状态" /> : null}
        </View>

        {accountEmail ? (
          <>
            <SectionTitle styles={styles}>账户</SectionTitle>
            {onOpenDataPrivacy ? (
              <View style={styles.settingsCard}>
                <SettingRow icon="document-text-outline" onPress={onOpenDataPrivacy} styles={styles} title="数据与隐私" subtitle="查看当前功能涉及的数据范围" />
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

function SettingRow({ accessibilityLabel, disabled = false, icon, title, subtitle, value, statusLabel, statusTone = 'unknown', onToggle, onPress, styles }: { accessibilityLabel?: string; disabled?: boolean; icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; value?: boolean; statusLabel?: string; statusTone?: 'on' | 'off' | 'unknown'; onToggle?: () => void; onPress?: () => void; styles: Styles }) {
  const content = (
    <>
      <View style={styles.settingIcon}><Ionicons color={styles.palette.iconColor} name={icon} size={17} /></View>
      <View style={styles.settingCopy}><Text style={styles.settingTitle}>{title}</Text><Text style={styles.settingSubtitle}>{subtitle}</Text></View>
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
    return <View accessibilityLabel={statusLabel ? accessibilityLabel ?? `${title}，${statusLabel}。${subtitle}` : undefined} accessibilityRole={statusLabel ? 'text' : undefined} accessible={Boolean(statusLabel)} style={styles.settingRow}>{content}</View>;
  }

  return (
    <Pressable accessibilityHint={disabled ? subtitle : `打开${title}`} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.settingRow, pressed && !disabled && styles.pressed]}>
      {content}
    </Pressable>
  );
}

function createStyles(colors: ThemeColors, isDark: boolean, layout: ProfileLayoutMetrics) {
  const { controlsColumnWidth, deviceColumnWidth, gridGap, padding, usesColumns } = layout;
  const p = getProductAppearance(isDark);
  const primaryCard = p.surface;
  const rowSurface = 'transparent';
  const neutralRing = isDark ? '#3B4651' : '#E1E5EB';

  return Object.assign(StyleSheet.create({
    measurementViewport: { flex: 1 },
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
    profileCard: { alignItems: 'center', backgroundColor: primaryCard, borderRadius: cardLayout.radius, flexDirection: 'row', marginBottom: 16, minHeight: 88, padding: cardLayout.inset },
    profileCopy: { flex: 1, marginLeft: 12, minWidth: 0, paddingRight: 10 },
    profileName: { ...typography.label, color: colors.ink },
    profileUsername: { ...typography.supporting, color: colors.muted, marginTop: 2 },
    editProfileButton: { alignItems: 'center', borderRadius: 18, justifyContent: 'center', minHeight: 48, paddingHorizontal: 8 },
    editProfileText: { ...typography.supporting, color: p.blueInk },
    headingBlock: { marginBottom: 12 },
    title: { ...typography.compactTitle, color: colors.ink },
    subtitle: { ...typography.supporting, color: colors.muted, marginTop: 4 },
    deviceCard: { backgroundColor: primaryCard, borderRadius: cardLayout.radius, minHeight: 236, padding: cardLayout.inset, width: '100%' },
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
    serial: { ...typography.supporting, color: colors.muted, marginTop: 8 },
    batteryRing: { alignItems: 'center', borderRadius: 37, borderWidth: 5, minHeight: 74, justifyContent: 'center', minWidth: 74, padding: 6 },
    batteryRingKnown: { borderColor: colors.greenStrong, borderLeftColor: neutralRing },
    batteryRingUnknown: { borderColor: neutralRing },
    batteryValue: { ...typography.label, color: colors.ink },
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
    connectionUnavailable: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: 22, justifyContent: 'center', minHeight: 48 },
    connectionUnavailableText: { ...typography.supporting, color: colors.inkSoft },
    retryButton: { alignItems: 'center', borderRadius: 22, flex: 1, justifyContent: 'center', minHeight: 48 },
    retryText: { ...typography.supporting, color: colors.muted },
    disconnectButton: { alignItems: 'center', backgroundColor: colors.dangerSurface, borderRadius: 22, flex: 1, justifyContent: 'center', minHeight: 48 },
    disconnectText: { ...typography.supporting, color: colors.dangerText },
    primarySettingsCard: { backgroundColor: primaryCard, borderRadius: cardLayout.radius, gap: 8, padding: cardLayout.inset },
    settingsCard: { backgroundColor: primaryCard, borderRadius: cardLayout.radius, gap: 8, padding: cardLayout.inset },
    settingRow: { alignItems: 'center', backgroundColor: rowSurface, borderRadius: 20, flexDirection: 'row', minHeight: 68, paddingVertical: 8 },
    settingIcon: { alignItems: 'center', borderRadius: 20, height: 32, justifyContent: 'center', width: 32 },
    settingCopy: { flex: 1, marginLeft: 10, minWidth: 0, paddingRight: 8 },
    settingTitle: { ...typography.label, color: colors.ink },
    settingSubtitle: { ...typography.supporting, color: colors.muted, marginTop: 2 },
    statusPill: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', minHeight: 28, minWidth: 52, paddingHorizontal: 4 },
    statusPillOn: { backgroundColor: 'transparent' },
    statusPillOff: { backgroundColor: 'transparent' },
    statusPillUnknown: { backgroundColor: 'transparent' },
    statusPillText: { ...typography.supporting },
    statusPillTextOn: { color: p.blueInk },
    statusPillTextNeutral: { color: colors.inkSoft },
    moreContent: { alignSelf: 'stretch', marginTop: 8, width: '100%' },
    accountCard: { alignItems: 'center', backgroundColor: primaryCard, borderRadius: cardLayout.radius, flexDirection: 'row', flexWrap: 'wrap', gap: 8, minHeight: 72, padding: cardLayout.inset },
    accountCopy: { flex: 1, minWidth: 0, paddingRight: 12 },
    accountLabel: { ...typography.supporting, color: colors.muted },
    accountEmail: { ...typography.label, color: colors.ink, marginTop: 4 },
    securityButton: { alignItems: 'center', borderRadius: 22, flexDirection: 'row', gap: 5, minHeight: 48, paddingHorizontal: 8 },
    securityText: { ...typography.supporting, color: p.blueInk },
    logoutButton: { alignItems: 'center', backgroundColor: colors.dangerSurface, borderRadius: 22, flexDirection: 'row', gap: 6, minHeight: 48, paddingHorizontal: 14 },
    logoutText: { ...typography.supporting, color: colors.dangerText },
  }), {
    palette: {
      chevronColor: p.secondary,
      iconColor: p.blueInk,
      switchOff: isDark ? '#46515C' : '#D8DEE9',
      switchOn: p.action,
    },
  });
}
