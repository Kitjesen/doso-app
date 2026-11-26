import { Ionicons } from '@expo/vector-icons';
import { type ReactNode, useState } from 'react';
import { Image, type ImageSourcePropType, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text } from './AppText';
import { getProductAppearance } from '../appearance';
import type { ControlImuReading, ControlJointState } from '../features/control/controlOperations';
import { useAppTheme } from '../theme';
import { typography } from '../typography';

let DEFAULT_STUDIO_TOP_IMAGE: ImageSourcePropType | undefined;
try {
  DEFAULT_STUDIO_TOP_IMAGE = require('../../assets/scene/thunder-r44-top.png');
} catch {
  DEFAULT_STUDIO_TOP_IMAGE = undefined;
}

/** 100% pure neutral black-gray palette (R == G == B) + 3 semantic telemetry accents only. */
export const STATUS_NEUTRAL = {
  canvas: '#121212',
  floatingBg: 'rgba(22, 22, 22, 0.94)',
  floatingSolid: '#181818',
  bayBg: '#161616',
  cardBg: '#1E1E1E',
  cardElevated: '#242424',
  recessed: '#151515',
  activeBg: '#2E2E2E',
  activeRim: 'rgba(255, 255, 255, 0.28)',
  outerBorder: 'rgba(255, 255, 255, 0.09)',
  hairline: 'rgba(255, 255, 255, 0.08)',
  hairlineSoft: 'rgba(255, 255, 255, 0.06)',
  haloRing: 'rgba(255, 255, 255, 0.07)',
  haloFill: 'rgba(255, 255, 255, 0.025)',
  ink: '#F2F2F2',
  muted: '#9A9A9A',
  subtle: '#666666',
  offlineBg: '#262626',
  offlineInk: '#A3A3A3',
  emerald: '#34D399',
  emeraldSoft: 'rgba(52, 211, 153, 0.14)',
  amber: '#F59E0B',
  amberSoft: 'rgba(245, 158, 11, 0.16)',
  red: '#EF4444',
  redSoft: 'rgba(239, 68, 68, 0.16)',
  redInk: '#FCA5A5',
} as const;

export type StatusBentoBody = Readonly<{
  posture?: 'unknown' | 'standing' | 'sitting';
  motorState?: 'unknown' | 'enabled' | 'disabled';
  controlAuthority?: 'unknown' | 'not-held' | 'held';
  faultStatus?: 'unknown' | 'clear' | 'active';
  controlOwner?: 'none' | 'grpc' | 'yunzhuo' | 'this-device' | 'remote' | 'robot-remote' | 'unknown';
  voltageV?: number | null;
  leaseActive?: boolean | null;
}>;

export type StatusBentoCardProps = Readonly<{
  floating?: boolean;
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
  onBack?: () => void;
  onClose?: () => void;
  emptyBanner?: ReactNode;
  maxWidth?: number;
  maxHeight?: number;
}>;

// Brainstem numbers the twelve leg joints before the four wheel motors.
export const STATUS_LEGS = [
  { id: 'front-left', label: '左前腿', shortLabel: '左前', joints: [['3', '髋关节', '髋'], ['4', '大腿', '大'], ['5', '小腿', '小'], ['13', '足轮', '轮']] },
  { id: 'front-right', label: '右前腿', shortLabel: '右前', joints: [['0', '髋关节', '髋'], ['1', '大腿', '大'], ['2', '小腿', '小'], ['12', '足轮', '轮']] },
  { id: 'rear-left', label: '左后腿', shortLabel: '左后', joints: [['9', '髋关节', '髋'], ['10', '大腿', '大'], ['11', '小腿', '小'], ['15', '足轮', '轮']] },
  { id: 'rear-right', label: '右后腿', shortLabel: '右后', joints: [['6', '髋关节', '髋'], ['7', '大腿', '大'], ['8', '小腿', '小'], ['14', '足轮', '轮']] },
] as const;

const KNOWN_IDS: readonly string[] = STATUS_LEGS.flatMap(leg => leg.joints.map(([id]) => id));

function valueLabel(value: number | null | undefined, unit: string) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)} ${unit}` : '—';
}

export function motorHealthLabel(joint: ControlJointState) {
  if (joint.source !== 'device') return '未同步';
  if (joint.online === false) return '离线';
  if ((joint.errors?.length ?? 0) > 0 || joint.fault === 'active') return '故障';
  if (joint.online !== true) return '未知';
  if (joint.statusCode === 0) return '复位';
  if (joint.statusCode === 1) return '标定';
  if (joint.statusCode === 2) return '运行';
  return '未知';
}

function compactAxisLabel(vector: { x: number; y: number; z: number } | null | undefined) {
  if (!vector) return null;
  return `${vector.x.toFixed(2)} ${vector.y.toFixed(2)} ${vector.z.toFixed(2)}`;
}

function deriveEulerDeg(q: ControlImuReading['quaternion'] | null | undefined) {
  if (!q || ![q.w, q.x, q.y, q.z].every(v => typeof v === 'number' && Number.isFinite(v))) return null;
  const sinrCosp = 2 * (q.w * q.x + q.y * q.z);
  const cosrCosp = 1 - 2 * (q.x * q.x + q.y * q.y);
  const rollDeg = Math.atan2(sinrCosp, cosrCosp) * (180 / Math.PI);
  const sinp = 2 * (q.w * q.y - q.z * q.x);
  const pitchDeg = (Math.abs(sinp) >= 1 ? Math.sign(sinp) * (Math.PI / 2) : Math.asin(sinp)) * (180 / Math.PI);
  const sinyCosp = 2 * (q.w * q.z + q.x * q.y);
  const cosyCosp = 1 - 2 * (q.y * q.y + q.z * q.z);
  const yawDeg = Math.atan2(sinyCosp, cosyCosp) * (180 / Math.PI);
  const signed = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}°`;
  return {
    rollDeg,
    pitchDeg,
    yawDeg,
    roll: signed(rollDeg),
    pitch: signed(pitchDeg),
    yaw: `${yawDeg.toFixed(1)}°`,
  };
}

function thermalDotColor(tempC: number | null | undefined, hasFault: boolean, isOffline: boolean, isRunning: boolean, isDark: boolean) {
  if (hasFault) return STATUS_NEUTRAL.red;
  if (isOffline) return isDark ? STATUS_NEUTRAL.offlineInk : '#666666';
  if (typeof tempC === 'number' && Number.isFinite(tempC)) {
    if (tempC >= 80) return STATUS_NEUTRAL.red;
    if (tempC >= 65) return STATUS_NEUTRAL.amber;
    return STATUS_NEUTRAL.emerald;
  }
  if (isRunning) return STATUS_NEUTRAL.emerald;
  return 'rgba(255, 255, 255, 0.22)';
}

function formatControlOwner(owner: StatusBentoBody['controlOwner']) {
  if (owner === 'none') return '无';
  if (owner === 'grpc') return '控制端';
  if (owner === 'this-device') return '本机';
  if (owner === 'yunzhuo' || owner === 'robot-remote') return '遥控器';
  if (owner === 'remote') return '远程';
  return '—';
}

export function StatusBentoCard({
  floating = false,
  isWorkspace = false,
  connectionLabel,
  remoteStatus,
  body,
  imu = null,
  showImu = true,
  deviceName,
  robotDiagram,
  studioDiagram,
  joints = [],
  observedAt,
  refreshing = false,
  error,
  onRefresh,
  onBack,
  onClose,
  emptyBanner,
  maxWidth,
  maxHeight,
}: StatusBentoCardProps) {
  const [selectedMotor, setSelectedMotor] = useState<{ id: string; label: string } | null>(null);
  const [activeLegId, setActiveLegId] = useState<(typeof STATUS_LEGS)[number]['id']>('front-left');
  const [tempModule, setTempModule] = useState<'motor' | 'driver'>('motor');
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  const theme = useAppTheme();
  const isDark = floating ? true : theme.isDark;
  const appearance = getProductAppearance(isDark);

  const outerBg = isDark ? (floating ? STATUS_NEUTRAL.floatingBg : STATUS_NEUTRAL.canvas) : appearance.canvas;
  const bayBg = isDark ? STATUS_NEUTRAL.bayBg : appearance.surface;
  const cardBg = isDark ? STATUS_NEUTRAL.cardBg : appearance.surface;
  const recessedBg = isDark ? STATUS_NEUTRAL.recessed : '#EFEFEF';
  const activeBg = isDark ? STATUS_NEUTRAL.activeBg : '#E2E2E2';
  const activeBorder = isDark ? STATUS_NEUTRAL.activeRim : 'rgba(20, 20, 20, 0.26)';
  const hairlineCol = isDark ? STATUS_NEUTRAL.hairline : 'rgba(20, 20, 20, 0.10)';
  const hairlineSoftCol = isDark ? STATUS_NEUTRAL.hairlineSoft : 'rgba(20, 20, 20, 0.07)';
  const inkCol = isDark ? STATUS_NEUTRAL.ink : appearance.ink;
  const mutedCol = isDark ? STATUS_NEUTRAL.muted : appearance.secondary;
  const subtleCol = isDark ? STATUS_NEUTRAL.subtle : '#777777';
  const faultColor = isDark ? STATUS_NEUTRAL.redInk : '#B42318';
  const offlineColor = isDark ? STATUS_NEUTRAL.offlineInk : '#566878';

  const validJoints = joints.filter(
    joint => typeof joint?.id === 'string' && joint.id.length > 0 && typeof joint.label === 'string' && joint.label.length > 0,
  );
  const hasDeviceSnapshot = validJoints.some(joint => joint.source === 'device');
  const knownJoints = KNOWN_IDS.map(id => validJoints.find(joint => joint.id === id)).filter(
    (joint): joint is ControlJointState => joint !== undefined,
  );
  const otherJoints = validJoints.filter(joint => !KNOWN_IDS.includes(joint.id));
  const reportedJoints = knownJoints.filter(joint => joint.source === 'device');
  const faultCount = reportedJoints.filter(joint => joint.fault === 'active' || (joint.errors?.length ?? 0) > 0).length;
  const offlineCount = reportedJoints.filter(joint => joint.online === false).length;
  const onlineCount = reportedJoints.filter(joint => joint.online === true).length;
  const driverTempReported = reportedJoints.some(
    joint => joint.online === true && typeof joint.driverTemperatureC === 'number' && Number.isFinite(joint.driverTemperatureC),
  );
  const effectiveModule: 'motor' | 'driver' = driverTempReported ? tempModule : 'motor';
  const updatedTime = observedAt && Number.isFinite(Date.parse(observedAt))
    ? new Date(observedAt).toLocaleTimeString('zh-CN', { hour12: false })
    : null;
  const selectedJoint = selectedMotor ? validJoints.find(joint => joint.id === selectedMotor.id) : undefined;

  const voltageLive = typeof body?.voltageV === 'number' && Number.isFinite(body.voltageV) && body.voltageV > 0;
  const voltageRatio = voltageLive ? Math.min(1, Math.max(0.10, ((body?.voltageV ?? 0) - 42) / 13)) : 0;
  const voltageLow = voltageLive && (body?.voltageV ?? 0) < 44;
  const voltageBarColor = !voltageLive ? 'rgba(255, 255, 255, 0.14)' : voltageLow ? STATUS_NEUTRAL.amber : STATUS_NEUTRAL.emerald;
  const powerBadgeLabel = !voltageLive ? '未连接' : voltageLow ? '偏低' : '正常';
  const powerBadgeBg = !voltageLive ? recessedBg : voltageLow ? STATUS_NEUTRAL.amberSoft : STATUS_NEUTRAL.emeraldSoft;
  const powerBadgeInk = !voltageLive ? mutedCol : voltageLow ? STATUS_NEUTRAL.amber : STATUS_NEUTRAL.emerald;

  const euler = deriveEulerDeg(imu?.quaternion);
  const gyroShort = compactAxisLabel(imu?.gyroscope);
  const horizonRoll = euler ? Math.max(-45, Math.min(45, euler.rollDeg)) : 0;
  const horizonPitchPx = euler ? Math.max(-9, Math.min(9, euler.pitchDeg * 0.28)) : 0;
  const activeStudioDiagram = studioDiagram ?? (!robotDiagram ? DEFAULT_STUDIO_TOP_IMAGE : undefined);

  const isConnected = connectionLabel === '已连接' || hasDeviceSnapshot;
  const consolidatedStatusText = hasDeviceSnapshot
    ? (connectionLabel === '已连接' ? '已连接 · 已同步' : '已同步')
    : (connectionLabel ?? '未同步');
  const statusDotColor = hasDeviceSnapshot || connectionLabel === '已连接'
    ? STATUS_NEUTRAL.emerald
    : connectionLabel === '只读连接' || connectionLabel === '只读已响应'
      ? STATUS_NEUTRAL.amber
      : subtleCol;

  const activeLegSpec = STATUS_LEGS.find(leg => leg.id === activeLegId) ?? STATUS_LEGS[0];
  const effectiveWidth = typeof maxWidth === 'number' && maxWidth > 0 ? maxWidth : 656;
  const stacked = effectiveWidth < 520;
  const compact = floating || effectiveWidth <= 680;
  const bayWidth = stacked
    ? undefined
    : Math.max(168, Math.min(compact ? 216 : 254, Math.round(effectiveWidth * 0.34)));
  const narrowBay = !stacked && (bayWidth ?? 222) < 196;
  const heroWidth = narrowBay ? 96 : compact ? 116 : 138;
  const heroHeight = narrowBay ? 120 : compact ? 144 : 172;
  const haloOuterSize = narrowBay ? 116 : compact ? 138 : 166;
  const haloInnerSize = narrowBay ? 78 : compact ? 92 : 114;

  const getLegSummary = (leg: (typeof STATUS_LEGS)[number]) => {
    const temps: number[] = [];
    let hasFault = false;
    let anyOffline = false;
    let anyRunning = false;
    for (const [id] of leg.joints) {
      const joint = knownJoints.find(item => item.id === id);
      if (joint?.source !== 'device') continue;
      if (joint.fault === 'active' || (joint.errors?.length ?? 0) > 0) hasFault = true;
      if (joint.online === false) anyOffline = true;
      if (joint.online === true) {
        if (joint.statusCode === 2) anyRunning = true;
        const raw = effectiveModule === 'driver' ? joint.driverTemperatureC : joint.temperatureC;
        if (typeof raw === 'number' && Number.isFinite(raw)) temps.push(raw);
      }
    }
    const maxTemp = temps.length > 0 ? Math.max(...temps) : null;
    const dotColor = thermalDotColor(maxTemp, hasFault, anyOffline && !anyRunning, anyRunning, isDark);
    return { maxTemp, hasFault, dotColor };
  };

  const kpiItems = [
    {
      id: 'posture',
      label: '姿态',
      value: body?.posture === 'standing' ? '站立' : body?.posture === 'sitting' ? '坐下' : '—',
      accent: body?.posture === 'standing' || body?.posture === 'sitting' ? inkCol : mutedCol,
    },
    {
      id: 'motor',
      label: '电机',
      value: body?.motorState === 'enabled' ? '已使能' : body?.motorState === 'disabled' ? '已失能' : '—',
      accent: body?.motorState === 'enabled' ? STATUS_NEUTRAL.emerald : body?.motorState === 'disabled' ? inkCol : mutedCol,
    },
    {
      id: 'authority',
      label: '控制权',
      value: body?.controlAuthority === 'held' ? '本机' : body?.controlAuthority === 'not-held' ? '未取得' : '—',
      accent: body?.controlAuthority === 'held' ? inkCol : mutedCol,
    },
    {
      id: 'owner',
      label: '控制源',
      value: formatControlOwner(body?.controlOwner),
      accent: body?.controlOwner && body.controlOwner !== 'none' && body.controlOwner !== 'unknown' ? inkCol : mutedCol,
    },
    {
      id: 'lease',
      label: '租约',
      value: body?.leaseActive === true ? '有效' : body?.leaseActive === false ? '未持有' : '—',
      accent: body?.leaseActive === true ? STATUS_NEUTRAL.emerald : mutedCol,
    },
    {
      id: 'fault',
      label: '故障',
      value: body?.faultStatus === 'clear' ? '无故障' : body?.faultStatus === 'active' ? '有故障' : '—',
      accent: body?.faultStatus === 'active' ? faultColor : body?.faultStatus === 'clear' ? STATUS_NEUTRAL.emerald : mutedCol,
    },
  ];

  const renderJointDetailRow = (id: string, label: string, joint?: ControlJointState) => {
    const measurement = joint?.source === 'device' && joint.online === true ? joint : undefined;
    const health = joint ? motorHealthLabel(joint) : '未上报';
    const errors = joint?.source === 'device' ? joint.errors?.filter(code => Number.isInteger(code) && code >= 0) ?? [] : [];
    const hasFault = joint?.source === 'device' && (errors.length > 0 || joint.fault === 'active');
    return (
      <View key={id} style={[styles.detailRow, { borderColor: hairlineCol }]} testID={`joint-status-${id}`}>
        <View style={styles.detailRowHead}>
          <View style={styles.detailRowName}>
            <Text numberOfLines={1} style={[styles.detailRowTitle, { color: inkCol }]}>{label}</Text>
            <Text numberOfLines={1} style={[styles.detailRowId, { color: mutedCol }]}>ID {id}</Text>
          </View>
          <Text
            numberOfLines={1}
            style={[styles.detailRowMeta, { color: hasFault ? faultColor : mutedCol }]}
            testID={!joint ? `joint-status-missing-${id}` : undefined}
          >
            {health}
          </Text>
        </View>
        <View style={styles.detailMetrics}>
          {[
            ['位置', valueLabel(measurement?.positionDeg, '°')],
            ['温度', valueLabel(measurement?.temperatureC, '°C')],
            ['电压', valueLabel(measurement?.voltageV, 'V')],
            ['速度', valueLabel(measurement?.velocityRps, 'rad/s')],
            ['力矩', valueLabel(measurement?.torqueNm, 'N m')],
          ].map(([name, value]) => (
            <View key={name} style={styles.detailMetric}>
              <Text numberOfLines={1} style={[styles.detailMetricLabel, { color: mutedCol }]}>{name}</Text>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[styles.detailMetricValue, { color: inkCol }]}>
                {value}
              </Text>
            </View>
          ))}
        </View>
        {errors.length ? (
          <Text style={[styles.detailRowMeta, { color: faultColor }]} testID={`joint-status-errors-${id}`}>
            错误码 {errors.join('、')}
          </Text>
        ) : null}
      </View>
    );
  };

  const renderCornerChip = (leg: (typeof STATUS_LEGS)[number], posStyle: object) => {
    const summary = getLegSummary(leg);
    const active = activeLegId === leg.id;
    return (
      <Pressable
        key={leg.id}
        accessibilityLabel={`${leg.label}热力摘要`}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => setActiveLegId(leg.id)}
        style={({ pressed }) => [
          styles.cornerChip,
          posStyle,
          {
            backgroundColor: active ? activeBg : cardBg,
            borderColor: active ? activeBorder : hairlineCol,
          },
          pressed && styles.pressed,
        ]}
        testID={`joint-status-pod-${leg.id}`}
      >
        <View style={[styles.cornerDot, { backgroundColor: summary.dotColor }]} />
        <Text numberOfLines={1} style={[styles.cornerLabel, { color: active ? inkCol : mutedCol }]}>{leg.shortLabel}</Text>
        <Text
          numberOfLines={1}
          style={[
            styles.cornerTemp,
            { color: summary.hasFault ? faultColor : summary.maxTemp !== null ? inkCol : subtleCol },
          ]}
        >
          {summary.maxTemp !== null ? `${Math.round(summary.maxTemp)}°` : '--'}
        </Text>
      </Pressable>
    );
  };

  const detailInnerCard = selectedMotor ? (
    <View
      accessibilityViewIsModal
      style={[
        styles.detailCard,
        { backgroundColor: cardBg, borderColor: hairlineCol },
      ]}
      testID="joint-status-detail"
    >
      <View style={styles.detailHeader}>
        <View style={styles.detailTitleCol}>
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.detailTitle, { color: inkCol }]}>
            {selectedMotor.label} / ID {selectedMotor.id}
          </Text>
          <Text numberOfLines={1} style={[styles.detailSub, { color: mutedCol }]}>{deviceName}</Text>
        </View>
        <Pressable
          accessibilityLabel="关闭电机详情"
          accessibilityRole="button"
          onPress={() => setSelectedMotor(null)}
          style={({ pressed }) => [styles.iconBtn, { backgroundColor: recessedBg, borderColor: hairlineSoftCol }, pressed && styles.pressed]}
          testID="joint-status-detail-close"
        >
          <Ionicons color={inkCol} name="close" size={16} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.detailBody}>
        {renderJointDetailRow(selectedMotor.id, '电机', selectedJoint)}
        <Text selectable style={[styles.detailRowMeta, { color: mutedCol }]} testID="joint-status-detail-code">
          状态码 {selectedJoint?.source === 'device' && Number.isInteger(selectedJoint.statusCode) ? selectedJoint.statusCode : '—'}
        </Text>
        {selectedJoint?.source === 'device'
          && selectedJoint.fault === 'active'
          && !selectedJoint.errors?.some(code => Number.isInteger(code) && code >= 0) ? (
          <Text style={[styles.detailRowMeta, { color: faultColor }]} testID="joint-status-detail-no-error-code">
            设备未提供错误码
          </Text>
        ) : null}
      </ScrollView>
    </View>
  ) : null;

  const bentoColumns = (
    <View style={[styles.bentoGrid, stacked && styles.bentoGridStacked]}>
      {/* Left Sculpted Chassis Bay */}
      <View style={[styles.chassisBay, { backgroundColor: bayBg, borderColor: hairlineSoftCol }, bayWidth ? { width: bayWidth } : styles.chassisBayFull]}>
        <View style={styles.bayHeader}>
          <Text numberOfLines={1} style={[styles.bayTitle, { color: mutedCol }]}>底盘热力</Text>
          <Text numberOfLines={1} style={[styles.bayCounter, { color: hasDeviceSnapshot ? mutedCol : subtleCol }]}>
            {hasDeviceSnapshot ? `${reportedJoints.length}/16` : '未同步'}
          </Text>
        </View>

        <View
          accessible
          accessibilityLabel="四腿位置示意：以机器人自身为准，前方朝上，左侧从上到下为左前腿、左后腿，右侧为右前腿、右后腿。不表示实时姿态或关节位置。"
          style={styles.bayStage}
          testID="joint-status-leg-diagram"
        >
          {activeStudioDiagram ? (
            <>
              <View
                pointerEvents="none"
                style={[
                  styles.haloOuter,
                  {
                    borderRadius: haloOuterSize / 2,
                    height: haloOuterSize,
                    width: haloOuterSize,
                  },
                ]}
              >
                <View
                  style={[
                    styles.haloInner,
                    {
                      borderRadius: haloInnerSize / 2,
                      height: haloInnerSize,
                      width: haloInnerSize,
                    },
                  ]}
                />
              </View>
              <Text numberOfLines={1} style={[styles.frontCueStudio, { color: subtleCol }]}>前方 ↑</Text>
              <Image
                accessible={false}
                resizeMode="contain"
                source={activeStudioDiagram}
                style={[styles.studioHeroImg, { height: heroHeight, width: heroWidth }]}
                testID="joint-status-model-diagram"
              />
              {renderCornerChip(STATUS_LEGS[0], styles.cornerTL)}
              {renderCornerChip(STATUS_LEGS[1], styles.cornerTR)}
              {renderCornerChip(STATUS_LEGS[2], styles.cornerBL)}
              {renderCornerChip(STATUS_LEGS[3], styles.cornerBR)}
            </>
          ) : (
            <View style={styles.legacyDiagramWrap}>
              <Text numberOfLines={1} style={[styles.frontCueLegacy, { color: subtleCol }]}>前方 ↑</Text>
              <View style={styles.legacyDiagramRow}>
                <View style={styles.legacyDiagramLabels} testID="joint-status-diagram-left">
                  <Text numberOfLines={1} style={[styles.legacyDiagramLabel, { color: mutedCol }]}>左前腿</Text>
                  <Text numberOfLines={1} style={[styles.legacyDiagramLabel, { color: mutedCol }]}>左后腿</Text>
                </View>
                {robotDiagram ? (
                  <Image
                    accessible={false}
                    resizeMode="contain"
                    source={robotDiagram}
                    style={[styles.modelLine, { tintColor: appearance.secondary }]}
                    testID="joint-status-model-diagram"
                  />
                ) : (
                  <View style={[styles.diagramBody, { borderColor: appearance.secondary }]} testID="joint-status-generic-diagram">
                    <View style={[styles.diagramNose, { borderColor: appearance.secondary }]} />
                    {['front-left', 'front-right', 'rear-left', 'rear-right'].map((leg, index) => (
                      <View
                        key={leg}
                        style={[
                          styles.diagramBranch,
                          {
                            borderColor: appearance.secondary,
                            top: index < 2 ? 10 : undefined,
                            bottom: index >= 2 ? 10 : undefined,
                            left: index % 2 === 0 ? -15 : undefined,
                            right: index % 2 === 1 ? -15 : undefined,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.diagramFoot,
                            {
                              backgroundColor: bayBg,
                              borderColor: appearance.secondary,
                              left: index % 2 === 0 ? -4 : undefined,
                              right: index % 2 === 1 ? -4 : undefined,
                            },
                          ]}
                        />
                      </View>
                    ))}
                  </View>
                )}
                <View style={styles.legacyDiagramLabels} testID="joint-status-diagram-right">
                  <Text numberOfLines={1} style={[styles.legacyDiagramLabel, { color: mutedCol }]}>右前腿</Text>
                  <Text numberOfLines={1} style={[styles.legacyDiagramLabel, { color: mutedCol }]}>右后腿</Text>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Bottom 4-Cell Selected-Leg Breakdown Bar */}
        <View style={[styles.legBreakdown, { borderTopColor: hairlineSoftCol }]}>
          <View style={styles.legBreakdownHead}>
            <Text numberOfLines={1} style={[styles.legBreakdownTitle, { color: inkCol }]}>
              {activeLegSpec.shortLabel}明细
            </Text>
            <Text numberOfLines={1} style={[styles.legBreakdownHint, { color: subtleCol }]}>
              {hasDeviceSnapshot ? '点击切换' : '未同步'}
            </Text>
          </View>
          <View style={styles.legMiniRow}>
            {activeLegSpec.joints.map(([id, fullLabel, shortJoint]) => {
              const joint = knownJoints.find(item => item.id === id);
              const health = joint ? motorHealthLabel(joint) : '未上报';
              const hasFault = joint?.source === 'device' && (joint.fault === 'active' || (joint.errors?.length ?? 0) > 0);
              const isOffline = joint?.source === 'device' && joint.online === false;
              const isRunning = health === '运行';
              const isSelected = selectedMotor?.id === id;
              const rawTemp = joint?.source === 'device' && joint.online === true
                ? (effectiveModule === 'driver' ? joint.driverTemperatureC : joint.temperatureC)
                : null;
              const tempNum = typeof rawTemp === 'number' && Number.isFinite(rawTemp) ? rawTemp : null;
              const posNum = joint?.source === 'device' && joint.online === true
                && typeof joint.positionDeg === 'number' && Number.isFinite(joint.positionDeg)
                ? joint.positionDeg
                : null;
              const dotCol = thermalDotColor(tempNum, hasFault, isOffline, isRunning, isDark);
              return (
                <Pressable
                  key={id}
                  accessibilityLabel={`${activeLegSpec.label}${fullLabel}，${health}`}
                  accessibilityRole="button"
                  onPress={() => setSelectedMotor({ id, label: `${activeLegSpec.label} · ${fullLabel}` })}
                  style={({ pressed }) => [
                    styles.legMiniCell,
                    {
                      backgroundColor: isSelected ? activeBg : cardBg,
                      borderColor: isSelected ? activeBorder : hairlineSoftCol,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.legMiniTop}>
                    <Text numberOfLines={1} style={[styles.legMiniName, { color: mutedCol }]}>{shortJoint}</Text>
                    <View style={[styles.miniDot, { backgroundColor: dotCol }]} />
                  </View>
                  <Text numberOfLines={1} style={[styles.legMiniTemp, { color: hasFault ? faultColor : tempNum !== null ? inkCol : subtleCol }]}>
                    {tempNum !== null ? `${Math.round(tempNum)}°` : '--'}
                  </Text>
                  <Text numberOfLines={1} style={[styles.legMiniPos, { color: subtleCol }]}>
                    {posNum !== null ? `${posNum.toFixed(1)}°` : '—'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Right Tight Bento Stack */}
      <View style={styles.rightStack}>
        {/* Top Row: Power & Health | Attitude & Artificial Horizon */}
        <View style={styles.topCardsRow}>
          <View style={[styles.topCard, styles.powerCard, { backgroundColor: cardBg, borderColor: hairlineSoftCol }]} testID="joint-status-power">
            <View style={styles.cardHeadRow}>
              <Text numberOfLines={1} style={[styles.cardLabel, { color: mutedCol }]}>动力与健康</Text>
              <View style={[styles.badgePill, { backgroundColor: powerBadgeBg }]}>
                <Text numberOfLines={1} style={[styles.badgeText, { color: powerBadgeInk }]}>{powerBadgeLabel}</Text>
              </View>
            </View>
            <View style={styles.voltageMidRow}>
              <Text numberOfLines={1} style={[styles.voltageHero, { color: voltageLive ? inkCol : mutedCol }]}>
                {voltageLive ? `${body!.voltageV!.toFixed(1)} V` : '-- V'}
              </Text>
              <Text numberOfLines={1} style={[styles.voltageSub, { color: subtleCol }]}>
                {body?.leaseActive === true ? '租约有效' : '42–55V'}
              </Text>
            </View>
            <View style={[styles.voltageTrack, { backgroundColor: recessedBg }]}>
              <View style={[styles.voltageFill, { backgroundColor: voltageBarColor, width: `${Math.round(voltageRatio * 100)}%` }]} />
            </View>
          </View>

          {showImu ? (
            <View style={[styles.topCard, styles.imuCard, { backgroundColor: cardBg, borderColor: hairlineSoftCol }]} testID="joint-status-imu">
              <View style={styles.cardHeadRow}>
                <Text numberOfLines={1} style={[styles.cardLabel, { color: mutedCol }]}>机身姿态</Text>
                <Text numberOfLines={1} style={[styles.imuMetaText, { color: subtleCol }]}>
                  {gyroShort ?? (imu?.source === 'device' ? '已同步' : '未同步')}
                </Text>
              </View>
              <View style={styles.horizonRow}>
                <View
                  accessible
                  accessibilityLabel={`水平仪 横滚 ${euler?.roll ?? '未同步'} 俯仰 ${euler?.pitch ?? '未同步'}`}
                  style={[styles.horizonAperture, { backgroundColor: recessedBg, borderColor: hairlineCol }]}
                  testID="joint-status-horizon"
                >
                  <View
                    pointerEvents="none"
                    style={[
                      styles.horizonPlane,
                      {
                        backgroundColor: euler ? STATUS_NEUTRAL.emeraldSoft : 'rgba(255, 255, 255, 0.05)',
                        borderTopColor: euler ? STATUS_NEUTRAL.emerald : 'rgba(255, 255, 255, 0.28)',
                        transform: [{ translateY: horizonPitchPx }, { rotate: `${-horizonRoll}deg` }],
                      },
                    ]}
                  />
                  <View pointerEvents="none" style={[styles.horizonCenterMark, { backgroundColor: inkCol }]} />
                </View>

                <View style={styles.eulerCols}>
                  {[
                    ['横滚', euler?.roll ?? '--°'],
                    ['俯仰', euler?.pitch ?? '--°'],
                    ['偏航', euler?.yaw ?? '--°'],
                  ].map(([label, val]) => (
                    <View key={label} style={styles.eulerCol}>
                      <Text numberOfLines={1} style={[styles.eulerLabel, { color: subtleCol }]}>{label}</Text>
                      <Text numberOfLines={1} style={[styles.eulerVal, { color: euler ? inkCol : mutedCol }]}>{val}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ) : null}
        </View>

        {/* Middle Card: Clickable 4×4 16-Joint Matrix */}
        <View style={[styles.matrixCard, { backgroundColor: cardBg, borderColor: hairlineSoftCol }]} testID="joint-status-overview">
          <View style={styles.matrixHeader}>
            <View style={styles.matrixTitleGroup}>
              <Text numberOfLines={1} style={[styles.cardLabel, { color: mutedCol }]}>16 关节矩阵</Text>
              {knownJoints.length ? (
                <View
                  accessibilityLabel={`已上报 ${reportedJoints.length}/16，在线 ${onlineCount}，故障 ${faultCount}，离线 ${offlineCount}`}
                  style={styles.inlineSummary}
                  testID="joint-status-summary"
                >
                  <Text numberOfLines={1} style={[styles.inlineSummaryText, { color: inkCol }]} testID="joint-status-report-count">
                    {reportedJoints.length}/16
                  </Text>
                  <Text numberOfLines={1} style={[styles.inlineSummaryText, { color: faultCount > 0 ? faultColor : subtleCol }]} testID="joint-status-fault-count">
                    故障 {faultCount}
                  </Text>
                  <Text numberOfLines={1} style={[styles.inlineSummaryText, { color: offlineCount > 0 ? offlineColor : subtleCol }]} testID="joint-status-offline-count">
                    离线 {offlineCount}
                  </Text>
                  {updatedTime ? (
                    <Text numberOfLines={1} style={[styles.updatedText, { color: subtleCol }]} testID="joint-status-updated">
                      {updatedTime}
                    </Text>
                  ) : null}
                </View>
              ) : updatedTime ? (
                <Text numberOfLines={1} style={[styles.updatedText, { color: subtleCol }]} testID="joint-status-updated">
                  {updatedTime}
                </Text>
              ) : null}
            </View>

            {driverTempReported ? (
              <View style={[styles.moduleSegTrack, { backgroundColor: recessedBg, borderColor: hairlineSoftCol }]}>
                {([['motor', '电机'], ['driver', '驱动器']] as const).map(([kind, label]) => {
                  const active = effectiveModule === kind;
                  return (
                    <Pressable
                      key={kind}
                      accessibilityLabel={label}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      onPress={() => setTempModule(kind)}
                      style={[styles.moduleSegBtn, active && { backgroundColor: activeBg }]}
                    >
                      <Text numberOfLines={1} style={[styles.moduleSegText, { color: active ? inkCol : mutedCol }]}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={styles.matrixColHead} testID="joint-status-overview-head">
            <View style={styles.matrixLegCol} />
            {['髋', '大腿', '小腿', '足轮'].map(col => (
              <Text key={col} numberOfLines={1} style={[styles.matrixColLabel, { color: subtleCol }]}>{col}</Text>
            ))}
          </View>

          <View style={styles.matrixRows}>
            {STATUS_LEGS.map(leg => {
              const legSelected = activeLegId === leg.id;
              return (
                <View key={leg.id} style={styles.matrixRow}>
                  <Pressable
                    accessibilityLabel={leg.label}
                    accessibilityRole="button"
                    onPress={() => setActiveLegId(leg.id)}
                    style={styles.matrixLegCol}
                  >
                    <Text numberOfLines={1} style={[styles.matrixLegLabel, { color: legSelected ? inkCol : mutedCol }]}>
                      {leg.shortLabel}
                    </Text>
                  </Pressable>
                  {leg.joints.map(([id, fullLabel]) => {
                    const joint = knownJoints.find(item => item.id === id);
                    const health = joint ? motorHealthLabel(joint) : '未上报';
                    const hasFault = joint?.source === 'device' && (joint.fault === 'active' || (joint.errors?.length ?? 0) > 0);
                    const isOffline = joint?.source === 'device' && joint.online === false;
                    const isRunning = health === '运行';
                    const isSelected = selectedMotor?.id === id;
                    const rawTemp = joint?.source === 'device' && joint.online === true
                      ? (effectiveModule === 'driver' ? joint.driverTemperatureC : joint.temperatureC)
                      : null;
                    const tempNum = typeof rawTemp === 'number' && Number.isFinite(rawTemp) ? rawTemp : null;
                    const posNum = joint?.source === 'device' && joint.online === true
                      && typeof joint.positionDeg === 'number' && Number.isFinite(joint.positionDeg)
                      ? joint.positionDeg
                      : null;
                    const dotCol = thermalDotColor(tempNum, hasFault, isOffline, isRunning, isDark);
                    const stateColor = hasFault ? faultColor : isOffline ? offlineColor : mutedCol;

                    return (
                      <Pressable
                        key={id}
                        accessibilityHint="查看电机详情"
                        accessibilityLabel={`${leg.label}${fullLabel}，${health}`}
                        accessibilityRole="button"
                        onPress={() => {
                          setActiveLegId(leg.id);
                          setSelectedMotor({ id, label: `${leg.label} · ${fullLabel}` });
                        }}
                        style={({ pressed }) => [
                          styles.matrixCell,
                          { backgroundColor: recessedBg, borderColor: hairlineSoftCol },
                          isOffline && { backgroundColor: isDark ? STATUS_NEUTRAL.offlineBg : '#E7EDF2' },
                          hasFault && { backgroundColor: isDark ? STATUS_NEUTRAL.redSoft : '#FDECE9' },
                          isSelected && { backgroundColor: activeBg, borderColor: activeBorder },
                          pressed && styles.pressed,
                        ]}
                        testID={`joint-status-overview-${id}`}
                      >
                        {knownJoints.length === 0 ? (
                          <View style={styles.matrixCellOffline}>
                            <View style={[styles.cellDot, { backgroundColor: 'rgba(255, 255, 255, 0.22)' }]} />
                            <Text numberOfLines={1} style={[styles.cellOfflineDash, { color: subtleCol }]}>--</Text>
                          </View>
                        ) : isRunning ? (
                          tempNum !== null || posNum !== null ? (
                            <View style={styles.matrixCellLive}>
                              <View style={[styles.cellDot, { backgroundColor: dotCol }]} testID={`joint-status-running-${id}`} />
                              <Text numberOfLines={1} style={[styles.cellTemp, { color: inkCol }]}>
                                {tempNum !== null ? `${Math.round(tempNum)}°` : '--'}
                              </Text>
                              {posNum !== null ? (
                                <Text numberOfLines={1} style={[styles.cellPos, { color: subtleCol }]}>
                                  {`${posNum.toFixed(1)}°`}
                                </Text>
                              ) : null}
                            </View>
                          ) : (
                            <View
                              accessible={false}
                              style={[styles.runningDotOnly, { backgroundColor: isDark ? STATUS_NEUTRAL.emerald : appearance.blueInk }]}
                              testID={`joint-status-running-${id}`}
                            />
                          )
                        ) : (
                          <Text numberOfLines={1} style={[styles.cellStateText, { color: stateColor }]}>{health}</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </View>
              );
            })}
          </View>
        </View>

        {/* Bottom 6-Column Compact Hairline Strip */}
        <View style={[styles.bottomStrip, { backgroundColor: cardBg, borderColor: hairlineSoftCol }]} testID="joint-status-body">
          {kpiItems.map(item => (
            <View key={item.id} style={styles.stripCell}>
              <Text numberOfLines={1} style={[styles.stripLabel, { color: subtleCol }]}>{item.label}</Text>
              <Text numberOfLines={1} style={[styles.stripValue, { color: item.accent ?? inkCol }]}>{item.value}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );

  const cardShellWidth = floating ? Math.min(656, effectiveWidth) : undefined;
  const cardShellMaxHeight = floating && typeof maxHeight === 'number' ? maxHeight : undefined;

  return (
    <View
      style={[
        floating ? styles.floatingShell : styles.standaloneShell,
        {
          backgroundColor: outerBg,
          borderColor: floating ? STATUS_NEUTRAL.outerBorder : 'transparent',
          ...(cardShellWidth ? { width: cardShellWidth } : null),
          ...(cardShellMaxHeight ? { maxHeight: cardShellMaxHeight } : null),
        },
      ]}
      testID="status-bento-card"
    >
      {/* Compact Header (<= 34px) */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {!floating && !isWorkspace && onBack ? (
            <Pressable
              accessibilityLabel="返回控制中心"
              accessibilityRole="button"
              onPress={onBack}
              style={({ pressed }) => [styles.iconBtn, { backgroundColor: cardBg, borderColor: hairlineSoftCol }, pressed && styles.pressed]}
              testID="joint-status-back"
            >
              <Ionicons color={inkCol} name="arrow-back" size={16} />
            </Pressable>
          ) : null}
          <Text accessibilityRole="header" numberOfLines={1} style={[styles.headerTitle, { color: inkCol }]}>
            {floating || isWorkspace ? '设备状态' : '关节状态'}
          </Text>
          <View style={styles.headerDevice}>
            <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
            <Text numberOfLines={1} style={[styles.headerDeviceText, { color: mutedCol }]}>{deviceName}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <View style={[styles.statusPill, { backgroundColor: cardBg, borderColor: hairlineCol }]} testID="joint-status-source">
            <View style={[styles.statusDot, { backgroundColor: statusDotColor }]} />
            <Text
              numberOfLines={1}
              style={[styles.statusPillText, { color: isConnected ? inkCol : mutedCol }]}
              testID={connectionLabel ? 'robot-status-connection' : undefined}
            >
              {consolidatedStatusText}
            </Text>
          </View>
          {onRefresh ? (
            <Pressable
              accessibilityLabel="刷新关节状态"
              accessibilityRole="button"
              accessibilityState={{ disabled: refreshing }}
              disabled={refreshing}
              onPress={onRefresh}
              style={({ pressed }) => [styles.iconBtn, { backgroundColor: cardBg, borderColor: hairlineCol }, pressed && styles.pressed]}
              testID="joint-status-refresh"
            >
              <Ionicons color={inkCol} name="refresh" size={14} />
            </Pressable>
          ) : null}
          {onClose ? (
            <Pressable
              accessibilityLabel="关闭设备状态"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.iconBtn, { backgroundColor: cardBg, borderColor: hairlineCol }, pressed && styles.pressed]}
              testID="status-bento-close"
            >
              <Ionicons color={inkCol} name="close" size={15} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.errorLine, { color: faultColor }]} testID="joint-status-error">
          {error}
        </Text>
      ) : null}
      {remoteStatus}

      {floating ? (
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.floatingBodyScroll}
          showsVerticalScrollIndicator={false}
        >
          {bentoColumns}
        </ScrollView>
      ) : (
        <View style={styles.standaloneStack}>
          {bentoColumns}

          {knownJoints.length === 0 ? (
            emptyBanner ?? (
              <View style={[styles.emptyBar, { backgroundColor: cardBg, borderColor: hairlineSoftCol }]} testID="joint-status-empty">
                <Text numberOfLines={1} style={[styles.emptyTitle, { color: mutedCol }]}>待设备同步</Text>
                <Text numberOfLines={1} style={[styles.emptySub, { color: subtleCol }]}>连接设备并完成状态读取后显示</Text>
              </View>
            )
          ) : null}

          {validJoints.length ? (
            <View style={styles.detailsSection}>
              <Pressable
                accessibilityLabel="全部电机详情"
                accessibilityRole="button"
                accessibilityState={{ expanded: detailsExpanded }}
                onPress={() => setDetailsExpanded(!detailsExpanded)}
                style={({ pressed }) => [styles.detailsToggle, { backgroundColor: cardBg, borderColor: hairlineSoftCol }, pressed && styles.pressed]}
                testID="joint-status-details-toggle"
              >
                <Text numberOfLines={1} style={[styles.detailsToggleTitle, { color: inkCol }]}>全部电机详情</Text>
                <Ionicons accessible={false} color={mutedCol} name={detailsExpanded ? 'chevron-up' : 'chevron-down'} size={16} />
              </Pressable>
              {detailsExpanded ? (
                <View style={styles.detailsList} testID="joint-status-list">
                  {knownJoints.length ? STATUS_LEGS.map(leg => (
                    <View key={leg.id} style={[styles.detailsLegCard, { backgroundColor: cardBg, borderColor: hairlineSoftCol }]} testID={`joint-status-leg-${leg.id}`}>
                      <Text accessibilityRole="header" numberOfLines={1} style={[styles.detailsLegTitle, { color: inkCol }]}>{leg.label}</Text>
                      {leg.joints.map(([id, label]) => renderJointDetailRow(id, label, knownJoints.find(joint => joint.id === id)))}
                    </View>
                  )) : null}
                  {otherJoints.length ? (
                    <View style={[styles.detailsLegCard, { backgroundColor: cardBg, borderColor: hairlineSoftCol }]} testID="joint-status-other">
                      <Text accessibilityRole="header" numberOfLines={1} style={[styles.detailsLegTitle, { color: inkCol }]}>其他关节</Text>
                      {otherJoints.map(joint => renderJointDetailRow(joint.id, joint.label, joint))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      )}

      {/* Joint Detail Overlay: Inline inside floating card so E-Stop stays live; Modal in standalone screen */}
      {selectedMotor && floating ? (
        <View style={styles.inlineDetailOverlay} testID="joint-status-detail-overlay">
          <Pressable
            accessibilityLabel="关闭电机详情背景"
            accessibilityRole="button"
            onPress={() => setSelectedMotor(null)}
            style={StyleSheet.absoluteFill}
          />
          {detailInnerCard}
        </View>
      ) : null}

      {selectedMotor && !floating ? (
        <Modal
          animationType="fade"
          transparent
          supportedOrientations={['landscape-left', 'landscape-right']}
          onRequestClose={() => setSelectedMotor(null)}
          testID="joint-status-detail-modal"
        >
          <View style={styles.modalBackdrop}>
            {detailInnerCard}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  floatingShell: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 9,
    position: 'relative',
  },
  standaloneShell: {
    alignSelf: 'center',
    gap: 8,
    maxWidth: 748,
    width: '100%',
  },
  floatingBodyScroll: {
    gap: 6,
  },
  standaloneStack: {
    gap: 8,
  },

  /* Header */
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    height: 30,
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  headerTitle: {
    ...typography.compactTitle,
    fontSize: 15.5,
    fontWeight: '700',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  headerDevice: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 1,
    gap: 5,
    minWidth: 0,
  },
  headerDeviceText: {
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: '500',
    lineHeight: 15,
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  statusDot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  statusPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 24,
    paddingHorizontal: 9,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14,
  },
  iconBtn: {
    alignItems: 'center',
    borderRadius: 13,
    borderWidth: 1,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  errorLine: {
    fontSize: 11.5,
    lineHeight: 15,
    marginBottom: 4,
  },

  /* 2-Column Ultra-Compact Bento */
  bentoGrid: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 6,
  },
  bentoGridStacked: {
    flexDirection: 'column',
  },

  /* Left Sculpted Chassis Bay */
  chassisBay: {
    borderRadius: 12,
    borderWidth: 1,
    flexShrink: 0,
    justifyContent: 'space-between',
    padding: 8,
  },
  chassisBayFull: {
    width: '100%',
  },
  bayHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  bayTitle: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
  },
  bayCounter: {
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    lineHeight: 13,
  },
  bayStage: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 186,
    position: 'relative',
  },
  haloOuter: {
    alignItems: 'center',
    backgroundColor: STATUS_NEUTRAL.haloFill,
    borderColor: STATUS_NEUTRAL.haloRing,
    borderWidth: 1,
    justifyContent: 'center',
    position: 'absolute',
  },
  haloInner: {
    borderColor: STATUS_NEUTRAL.haloRing,
    borderWidth: 1,
  },
  frontCueStudio: {
    fontSize: 9.5,
    fontWeight: '600',
    letterSpacing: 1,
    lineHeight: 12,
    position: 'absolute',
    top: 7,
  },
  studioHeroImg: {
    marginTop: 10,
  },
  cornerChip: {
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    height: 22,
    paddingHorizontal: 6,
    position: 'absolute',
  },
  cornerTL: { left: 0, top: 2 },
  cornerTR: { right: 0, top: 2 },
  cornerBL: { bottom: 2, left: 0 },
  cornerBR: { bottom: 2, right: 0 },
  cornerDot: {
    borderRadius: 2.5,
    height: 5,
    width: 5,
  },
  cornerLabel: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
  },
  cornerTemp: {
    fontSize: 10.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 13,
  },

  /* Fallback Legacy Line/Generic Schematic */
  legacyDiagramWrap: { alignItems: 'center', gap: 6, justifyContent: 'center' },
  frontCueLegacy: { fontSize: 10, fontWeight: '600', letterSpacing: 1, lineHeight: 13 },
  legacyDiagramRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center' },
  legacyDiagramLabels: { height: 104, justifyContent: 'space-between' },
  legacyDiagramLabel: { fontSize: 10, fontWeight: '600', lineHeight: 13 },
  modelLine: { height: 136, width: 88 },
  diagramBody: { borderRadius: 12, borderWidth: 1.5, height: 80, width: 36 },
  diagramNose: { alignSelf: 'center', borderLeftWidth: 1.5, borderRightWidth: 1.5, borderTopWidth: 1.5, borderTopLeftRadius: 3, borderTopRightRadius: 3, height: 7, position: 'absolute', top: -8, width: 14 },
  diagramBranch: { borderTopWidth: 1.5, position: 'absolute', width: 14 },
  diagramFoot: { borderRadius: 4, borderWidth: 1.5, height: 8, position: 'absolute', top: -4.5, width: 8 },

  /* Selected-leg Bottom 4-Cell Bar */
  legBreakdown: {
    borderTopWidth: 1,
    gap: 5,
    marginTop: 6,
    paddingTop: 6,
  },
  legBreakdownHead: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legBreakdownTitle: {
    fontSize: 10.5,
    fontWeight: '700',
    lineHeight: 14,
  },
  legBreakdownHint: {
    fontSize: 9.5,
    lineHeight: 12,
  },
  legMiniRow: {
    flexDirection: 'row',
    gap: 4,
  },
  legMiniCell: {
    borderRadius: 7,
    borderWidth: 1,
    flex: 1,
    gap: 1,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  legMiniTop: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legMiniName: {
    fontSize: 9.5,
    fontWeight: '500',
    lineHeight: 12,
  },
  miniDot: {
    borderRadius: 2.5,
    height: 5,
    width: 5,
  },
  legMiniTemp: {
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 14,
  },
  legMiniPos: {
    fontSize: 9,
    fontVariant: ['tabular-nums'],
    lineHeight: 11,
  },

  /* Right Tight Bento Stack */
  rightStack: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  topCardsRow: {
    flexDirection: 'row',
    gap: 6,
    minHeight: 66,
  },
  topCard: {
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'space-between',
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  powerCard: {
    flex: 1,
  },
  imuCard: {
    flex: 1.15,
  },
  cardHeadRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  cardLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
  },
  badgePill: {
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 13,
  },
  voltageMidRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  voltageHero: {
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 21,
  },
  voltageSub: {
    fontSize: 9.5,
    fontVariant: ['tabular-nums'],
    lineHeight: 12,
  },
  voltageTrack: {
    borderRadius: 2,
    height: 4,
    overflow: 'hidden',
    width: '100%',
  },
  voltageFill: {
    borderRadius: 2,
    height: '100%',
  },

  /* IMU & Artificial Horizon */
  imuMetaText: {
    flexShrink: 1,
    fontSize: 9.5,
    fontVariant: ['tabular-nums'],
    lineHeight: 12,
  },
  horizonRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  horizonAperture: {
    alignItems: 'center',
    borderRadius: 17,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 34,
  },
  horizonPlane: {
    borderTopWidth: 1.5,
    height: 34,
    position: 'absolute',
    top: 17,
    width: 52,
  },
  horizonCenterMark: {
    borderRadius: 1,
    height: 1.5,
    width: 11,
  },
  eulerCols: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
  },
  eulerCol: {
    flex: 1,
    gap: 1,
  },
  eulerLabel: {
    fontSize: 9,
    fontWeight: '500',
    lineHeight: 11,
  },
  eulerVal: {
    fontSize: 11.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 14,
  },

  /* 4×4 16-Joint Matrix */
  matrixCard: {
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    gap: 4,
    justifyContent: 'space-between',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  matrixHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'space-between',
  },
  matrixTitleGroup: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  inlineSummary: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    minWidth: 0,
  },
  inlineSummaryText: {
    fontSize: 10,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 13,
  },
  updatedText: {
    fontSize: 9.5,
    fontVariant: ['tabular-nums'],
    lineHeight: 12,
    marginLeft: 'auto',
  },
  moduleSegTrack: {
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 1.5,
  },
  moduleSegBtn: {
    borderRadius: 4.5,
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },
  moduleSegText: {
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 13,
  },
  matrixColHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  matrixLegCol: {
    justifyContent: 'center',
    width: 28,
  },
  matrixColLabel: {
    flex: 1,
    fontSize: 9.5,
    fontWeight: '500',
    lineHeight: 12,
    textAlign: 'center',
  },
  matrixRows: {
    gap: 4,
  },
  matrixRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  matrixLegLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
  },
  matrixCell: {
    alignItems: 'center',
    borderRadius: 7,
    borderWidth: 1,
    flex: 1,
    height: 30,
    justifyContent: 'center',
    minWidth: 0,
    paddingHorizontal: 5,
  },
  matrixCellOffline: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  cellOfflineDash: {
    fontSize: 10.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    lineHeight: 13,
  },
  matrixCellLive: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    justifyContent: 'space-between',
    width: '100%',
  },
  cellDot: {
    borderRadius: 2.5,
    height: 5,
    width: 5,
  },
  runningDotOnly: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  cellTemp: {
    fontSize: 10.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 13,
  },
  cellPos: {
    fontSize: 9,
    fontVariant: ['tabular-nums'],
    lineHeight: 11,
  },
  cellStateText: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 13,
  },

  /* Bottom 6-Column Strip */
  bottomStrip: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    height: 38,
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  stripCell: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  stripLabel: {
    fontSize: 9,
    fontWeight: '500',
    lineHeight: 11,
  },
  stripValue: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    lineHeight: 14,
  },

  /* Standalone Empty & Collapsible Full Motor List */
  emptyBar: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  emptyTitle: {
    fontSize: 11.5,
    fontWeight: '600',
    lineHeight: 15,
  },
  emptySub: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
  },
  detailsSection: {
    gap: 8,
  },
  detailsToggle: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
    paddingHorizontal: 14,
  },
  detailsToggleTitle: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '600',
  },
  detailsList: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  detailsLegCard: {
    borderRadius: 12,
    borderWidth: 1,
    flexBasis: 300,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  detailsLegTitle: {
    ...typography.label,
    fontSize: 13,
    fontWeight: '700',
    paddingBottom: 6,
  },

  /* Joint Detail Overlay / Modal */
  inlineDetailOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 12, 12, 0.78)',
    bottom: 0,
    elevation: 18,
    justifyContent: 'center',
    left: 0,
    padding: 16,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 18,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(12, 12, 12, 0.72)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  detailCard: {
    borderRadius: 14,
    borderWidth: 1,
    maxHeight: '90%',
    maxWidth: 460,
    overflow: 'hidden',
    width: '100%',
  },
  detailHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  detailTitleCol: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  detailTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    lineHeight: 19,
  },
  detailSub: {
    fontSize: 11.5,
    lineHeight: 15,
  },
  detailBody: {
    gap: 8,
    paddingBottom: 14,
    paddingHorizontal: 14,
  },
  detailRow: {
    borderTopWidth: 1,
    gap: 6,
    paddingVertical: 8,
  },
  detailRowHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  detailRowName: {
    alignItems: 'baseline',
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailRowTitle: {
    ...typography.label,
    fontSize: 13,
  },
  detailRowId: {
    ...typography.caption,
    fontSize: 11,
  },
  detailRowMeta: {
    ...typography.caption,
    fontSize: 11.5,
  },
  detailMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailMetric: {
    alignItems: 'flex-start',
    flexBasis: 48,
    flexGrow: 1,
    minWidth: 44,
  },
  detailMetricLabel: {
    ...typography.caption,
    fontSize: 10.5,
  },
  detailMetricValue: {
    ...typography.supporting,
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    marginTop: 2,
  },
  pressed: {
    opacity: 0.68,
  },
});
