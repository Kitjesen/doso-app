import type { ControlJointState, ControlRuntimeState } from '../features/control/controlOperations';

export type HudLegId = 'front-left' | 'rear-left' | 'front-right' | 'rear-right';
export type HudJointModuleKind = 'motor' | 'driver';
export type HudLeftCategory = 'policy' | 'posture' | 'action';
export type HudCameraPosition = 'front' | 'rear';
export type HudHeadlightMode = 'off' | 'front' | 'both';
export type HudForwardDirection = 'front' | 'rear';

export type HudJointSlot = Readonly<{
  id: string;
  label: string;
  metric: 'deg' | 'rad/s';
}>;

export type HudLegSpec = Readonly<{
  id: HudLegId;
  label: string;
  shortLabel: string;
  joints: readonly [HudJointSlot, HudJointSlot, HudJointSlot, HudJointSlot];
}>;

// Order mirrors M20 Pro / G20 joint parameter tabs and Brainstem JointsMatrix IDs.
export const HUD_LEGS: readonly HudLegSpec[] = Object.freeze([
  Object.freeze({
    id: 'front-left',
    label: '左前腿',
    shortLabel: '左前',
    joints: Object.freeze([
      Object.freeze({ id: '3', label: '侧摆关节', metric: 'deg' as const }),
      Object.freeze({ id: '4', label: '髋关节', metric: 'deg' as const }),
      Object.freeze({ id: '5', label: '膝关节', metric: 'deg' as const }),
      Object.freeze({ id: '13', label: '轮关节', metric: 'rad/s' as const }),
    ]) as readonly [HudJointSlot, HudJointSlot, HudJointSlot, HudJointSlot],
  }),
  Object.freeze({
    id: 'rear-left',
    label: '左后腿',
    shortLabel: '左后',
    joints: Object.freeze([
      Object.freeze({ id: '9', label: '侧摆关节', metric: 'deg' as const }),
      Object.freeze({ id: '10', label: '髋关节', metric: 'deg' as const }),
      Object.freeze({ id: '11', label: '膝关节', metric: 'deg' as const }),
      Object.freeze({ id: '15', label: '轮关节', metric: 'rad/s' as const }),
    ]) as readonly [HudJointSlot, HudJointSlot, HudJointSlot, HudJointSlot],
  }),
  Object.freeze({
    id: 'front-right',
    label: '右前腿',
    shortLabel: '右前',
    joints: Object.freeze([
      Object.freeze({ id: '0', label: '侧摆关节', metric: 'deg' as const }),
      Object.freeze({ id: '1', label: '髋关节', metric: 'deg' as const }),
      Object.freeze({ id: '2', label: '膝关节', metric: 'deg' as const }),
      Object.freeze({ id: '12', label: '轮关节', metric: 'rad/s' as const }),
    ]) as readonly [HudJointSlot, HudJointSlot, HudJointSlot, HudJointSlot],
  }),
  Object.freeze({
    id: 'rear-right',
    label: '右后腿',
    shortLabel: '右后',
    joints: Object.freeze([
      Object.freeze({ id: '6', label: '侧摆关节', metric: 'deg' as const }),
      Object.freeze({ id: '7', label: '髋关节', metric: 'deg' as const }),
      Object.freeze({ id: '8', label: '膝关节', metric: 'deg' as const }),
      Object.freeze({ id: '14', label: '轮关节', metric: 'rad/s' as const }),
    ]) as readonly [HudJointSlot, HudJointSlot, HudJointSlot, HudJointSlot],
  }),
]);

export type HudJointHealthStatus = 'normal' | 'fault' | 'offline' | 'unsynced';

export type HudJointParamProjection = Readonly<{
  id: string;
  label: string;
  valueText: string;
  status: HudJointHealthStatus;
  statusLabel: string;
}>;

export function projectLegJointParameters(
  legId: HudLegId,
  joints?: readonly ControlJointState[],
): readonly HudJointParamProjection[] {
  const leg = HUD_LEGS.find(item => item.id === legId) ?? HUD_LEGS[0];
  return leg.joints.map(slot => {
    const joint = joints?.find(candidate => candidate.id === slot.id);
    if (!joint || joint.source !== 'device') {
      return { id: slot.id, label: slot.label, valueText: '--', status: 'unsynced', statusLabel: '未同步' };
    }
    if (joint.online === false) {
      return { id: slot.id, label: slot.label, valueText: '--', status: 'offline', statusLabel: '离线' };
    }
    const hasFault = joint.fault === 'active' || (joint.errors?.length ?? 0) > 0;
    const rawValue = slot.metric === 'rad/s' ? joint.velocityRps : joint.positionDeg;
    const valueText = typeof rawValue === 'number' && Number.isFinite(rawValue)
      ? slot.metric === 'rad/s'
        ? `${rawValue.toFixed(2)} rad/s`
        : `${Math.round(rawValue)}°`
      : '--';
    return {
      id: slot.id,
      label: slot.label,
      valueText,
      status: hasFault ? 'fault' : 'normal',
      statusLabel: hasFault ? '异常' : '正常',
    };
  });
}

export type HudTemperatureSeverity = 'normal' | 'warn' | 'protect' | 'unknown';

export type HudJointTemperatureNode = Readonly<{
  id: string;
  label: string;
  shortLabel: string;
  tempC: number | null;
  text: string;
  severity: HudTemperatureSeverity;
}>;

export type HudLegTemperatureGroup = Readonly<{
  id: HudLegId;
  label: string;
  shortLabel: string;
  nodes: readonly HudJointTemperatureNode[];
}>;

export function classifyJointTemperature(tempC: number | null | undefined, hasFault = false): HudTemperatureSeverity {
  const valid = typeof tempC === 'number' && Number.isFinite(tempC);
  if (hasFault && (!valid || tempC >= 65)) return 'protect';
  if (!valid) return hasFault ? 'protect' : 'unknown';
  if (tempC >= 80) return 'protect';
  if (tempC >= 65) return 'warn';
  return 'normal';
}

export function projectJointTemperatures(
  moduleKind: HudJointModuleKind,
  joints?: readonly ControlJointState[],
): Readonly<{
  groups: readonly HudLegTemperatureGroup[];
  minTempC: number | null;
  maxTempC: number | null;
  minSeverity: HudTemperatureSeverity;
  maxSeverity: HudTemperatureSeverity;
  driverReported: boolean;
}> {
  const validMotors = (joints ?? []).filter(
    joint => joint?.source === 'device' && joint.online === true,
  );
  const motorTemps = validMotors
    .map(joint => joint.temperatureC)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const driverReported = validMotors.some(
    joint => typeof joint.driverTemperatureC === 'number' && Number.isFinite(joint.driverTemperatureC),
  );

  const groups = HUD_LEGS.map(leg => ({
    id: leg.id,
    label: leg.label,
    shortLabel: leg.shortLabel,
    nodes: leg.joints.map(slot => {
      const joint = joints?.find(candidate => candidate.id === slot.id);
      const isOnlineDevice = joint?.source === 'device' && joint.online === true;
      const hasFault = Boolean(joint?.source === 'device' && (joint.fault === 'active' || (joint.errors?.length ?? 0) > 0));
      const rawTemp = !isOnlineDevice
        ? null
        : moduleKind === 'motor'
          ? joint.temperatureC
          : joint.driverTemperatureC;
      const tempC = typeof rawTemp === 'number' && Number.isFinite(rawTemp) ? rawTemp : null;
      const severity = classifyJointTemperature(tempC, hasFault && (moduleKind === 'motor' || driverReported));
      return {
        id: slot.id,
        label: slot.label,
        shortLabel: slot.label.replace('关节', ''),
        tempC,
        text: tempC !== null ? `${Math.round(tempC)}°` : '--',
        severity,
      };
    }),
  }));

  const minTempC = motorTemps.length ? Math.min(...motorTemps) : null;
  const maxTempC = motorTemps.length ? Math.max(...motorTemps) : null;
  return {
    groups,
    minTempC,
    maxTempC,
    minSeverity: classifyJointTemperature(minTempC),
    maxSeverity: classifyJointTemperature(maxTempC),
    driverReported,
  };
}

export type HudFaultItem = Readonly<{
  id: string;
  title: string;
  detail: string;
  severity: 'critical' | 'warning';
}>;

export function collectHudFaults({
  runtimeState,
  sessionError,
  recoveryError,
}: {
  runtimeState?: ControlRuntimeState;
  sessionError?: string | null;
  recoveryError?: string | null;
}): readonly HudFaultItem[] {
  const items: HudFaultItem[] = [];
  if (runtimeState?.faultStatus === 'active') {
    items.push({
      id: 'robot-critical-fault',
      title: '机器狗本体异常',
      detail: runtimeState.faultSummary || '控制器上报核心异常，请检查关节状态或立即急停。',
      severity: 'critical',
    });
  }
  for (const joint of runtimeState?.joints ?? []) {
    if (joint.source !== 'device') continue;
    const errors = joint.errors?.filter(code => Number.isInteger(code) && code >= 0) ?? [];
    if (joint.online === false) {
      items.push({
        id: `joint-offline-${joint.id}`,
        title: `${joint.label} 离线`,
        detail: `关节 ID ${joint.id} 未响应心跳，请检查通信链路。`,
        severity: 'critical',
      });
    } else if (joint.fault === 'active' || errors.length > 0) {
      items.push({
        id: `joint-fault-${joint.id}`,
        title: `${joint.label} 故障`,
        detail: errors.length ? `错误码：${errors.join('、')}` : '控制器标记该关节存在运行异常。',
        severity: 'critical',
      });
    } else if (typeof joint.temperatureC === 'number' && Number.isFinite(joint.temperatureC) && joint.temperatureC >= 65) {
      const overheat = joint.temperatureC >= 80;
      items.push({
        id: `joint-temp-${joint.id}`,
        title: `${joint.label} ${overheat ? '电机过热保护' : '电机温度预警'}`,
        detail: `当前电机温度 ${Math.round(joint.temperatureC)}°C，请注意散热。`,
        severity: overheat ? 'critical' : 'warning',
      });
    }
  }
  if (sessionError) {
    items.push({
      id: 'control-session-error',
      title: '控制链路提示',
      detail: sessionError,
      severity: 'warning',
    });
  }
  if (recoveryError) {
    items.push({
      id: 'recovery-error',
      title: '恢复动作异常',
      detail: recoveryError,
      severity: 'warning',
    });
  }
  return items;
}

export function projectTopSignalBadges({
  connection,
  runtimeState,
}: {
  connection: 'connected' | 'readonly' | 'disconnected';
  runtimeState?: ControlRuntimeState;
}) {
  const cellular = runtimeState?.cellular;
  const cellularVisible = Boolean(cellular?.source === 'controller' && cellular.connected === true);
  const cellularText = cellularVisible
    ? (cellular?.networkLabel?.trim() || (typeof cellular?.qualityPercent === 'number' && Number.isFinite(cellular.qualityPercent) ? `${Math.round(cellular.qualityPercent)}%` : '5G'))
    : '';

  const robotConnected = connection === 'connected' || connection === 'readonly';
  const robotLatency = typeof runtimeState?.robotLinkLatencyMs === 'number' && Number.isFinite(runtimeState.robotLinkLatencyMs) && runtimeState.robotLinkLatencyMs >= 0
    ? `${Math.round(runtimeState.robotLinkLatencyMs)}ms`
    : connection === 'connected' ? '在线' : '只读';

  const wifiSignal = runtimeState?.signal;
  const wifiKnown = wifiSignal?.source === 'controller' || wifiSignal?.source === 'device';
  const wifiQuality = wifiKnown && typeof wifiSignal?.qualityPercent === 'number' && Number.isFinite(wifiSignal.qualityPercent)
    && wifiSignal.qualityPercent >= 0 && wifiSignal.qualityPercent <= 100
    ? `${Math.round(wifiSignal.qualityPercent)}%`
    : wifiKnown && typeof wifiSignal?.rssiDbm === 'number' && Number.isFinite(wifiSignal.rssiDbm)
      ? `${Math.round(wifiSignal.rssiDbm)}dBm`
      : null;
  const wifiLatency = wifiKnown && typeof wifiSignal?.latencyMs === 'number' && Number.isFinite(wifiSignal.latencyMs) && wifiSignal.latencyMs >= 0
    ? `${Math.round(wifiSignal.latencyMs)}ms`
    : typeof runtimeState?.robotLinkLatencyMs === 'number' && Number.isFinite(runtimeState.robotLinkLatencyMs) && runtimeState.robotLinkLatencyMs >= 0
      ? `${Math.round(runtimeState.robotLinkLatencyMs)}ms`
      : null;
  const wifiVisible = robotConnected && wifiQuality !== null;
  const wifiText = wifiVisible ? (wifiLatency ? `${wifiQuality} ${wifiLatency}` : wifiQuality!) : '';

  return {
    cellularVisible,
    cellularText,
    robotVisible: robotConnected,
    robotText: robotLatency,
    wifiVisible,
    wifiText,
  } as const;
}

export function clampSpeedLimitPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  return Math.min(100, Math.max(10, Math.round(value)));
}

export function scaleControlVector<T extends { readonly x: number; readonly y: number }>(
  vector: T,
  speedLimitPercent: number,
): T {
  const clamped = clampSpeedLimitPercent(speedLimitPercent);
  if (clamped >= 100) return vector;
  const scale = clamped / 100;
  return {
    ...vector,
    x: vector.x === 0 ? 0 : vector.x * scale,
    y: vector.y === 0 ? 0 : vector.y * scale,
  };
}

export type HudBasicActionSpec = Readonly<{
  id: 'walk' | 'step' | 'crawl' | 'follow' | 'wave';
  label: string;
  supported: boolean;
}>;

export const HUD_BASIC_ACTIONS: readonly HudBasicActionSpec[] = Object.freeze([
  Object.freeze({ id: 'walk', label: '常规行走', supported: true }),
  Object.freeze({ id: 'step', label: '原地踏步', supported: false }),
  Object.freeze({ id: 'crawl', label: '匍匐前进', supported: false }),
  Object.freeze({ id: 'follow', label: '智能跟随', supported: false }),
  Object.freeze({ id: 'wave', label: '打招呼', supported: false }),
]);
