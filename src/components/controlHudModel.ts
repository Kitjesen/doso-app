import type { ControlBodyHeightState, ControlJointState, ControlRuntimeState } from '../features/control/controlOperations';

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
  const wifiCompactText = wifiVisible ? wifiQuality! : '';

  return {
    cellularVisible,
    cellularText,
    robotVisible: robotConnected,
    robotText: robotLatency,
    wifiVisible,
    wifiText,
    wifiCompactText,
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

export type HudGestureCategoryId = 'all' | 'social' | 'observe' | 'rhythm' | 'stage';

export type HudGestureInput = Readonly<{
  name: string;
  label: string;
  durationMs?: number;
}>;

export type HudGestureProjectedItem = Readonly<{
  name: string;
  label: string;
  category: Exclude<HudGestureCategoryId, 'all'>;
  durationMs: number;
  durationText: string;
  endPoseNote: string;
  cautionTag: string | null;
  sourceTag: '基础库' | 'Flip' | '扩展';
  previewKey: string;
}>;

export const HUD_GESTURE_CATEGORIES: readonly Readonly<{ id: HudGestureCategoryId; label: string }>[] = Object.freeze([
  Object.freeze({ id: 'all', label: '全部' }),
  Object.freeze({ id: 'social', label: '问候社交' }),
  Object.freeze({ id: 'observe', label: '观察表情' }),
  Object.freeze({ id: 'rhythm', label: '机身律动' }),
  Object.freeze({ id: 'stage', label: '舞台特殊' }),
]);

type GestureStaticMeta = Readonly<{
  category: Exclude<HudGestureCategoryId, 'all'>;
  defaultDurationMs: number;
  endPoseNote: string;
  cautionTag: string | null;
  sourceTag: '基础库' | 'Flip';
  previewKey?: string;
}>;

const GESTURE_STATIC_META: Readonly<Record<string, GestureStaticMeta>> = Object.freeze({
  // Social & Greeting (8 + legacy alias)
  sit_greet: { category: 'social', defaultDurationMs: 13660, endPoseNote: '三轮支撑 · 结束后停坐姿', cautionTag: '停坐姿', sourceTag: '基础库' },
  greet_stand: { category: 'social', defaultDurationMs: 9240, endPoseNote: '三轮支撑 · 结束后回站姿', cautionTag: '三足', sourceTag: '基础库' },
  offer_paw: { category: 'social', defaultDurationMs: 5020, endPoseNote: '三轮支撑 · 结束后回站姿', cautionTag: '三足', sourceTag: '基础库' },
  hello: { category: 'social', defaultDurationMs: 9420, endPoseNote: '四轮接地 · 结束后回站姿', cautionTag: null, sourceTag: 'Flip' },
  new_year_bow: { category: 'social', defaultDurationMs: 12540, endPoseNote: '四轮接地 · 三次拜年回站姿', cautionTag: null, sourceTag: 'Flip' },
  play_bow: { category: 'social', defaultDurationMs: 3300, endPoseNote: '四轮接地 · 结束后回站姿', cautionTag: null, sourceTag: '基础库' },
  flip_play_bow: { category: 'social', defaultDurationMs: 16280, endPoseNote: '四轮接地 · 长版深鞠躬回站姿', cautionTag: null, sourceTag: 'Flip' },
  diagonal_curtsy: { category: 'social', defaultDurationMs: 7040, endPoseNote: '四轮接地 · 对角行礼回站姿', cautionTag: null, sourceTag: 'Flip' },
  bow: { category: 'social', defaultDurationMs: 1900, endPoseNote: '四轮接地 · 结束后回站姿', cautionTag: null, sourceTag: '基础库', previewKey: 'play_bow' },

  // Observe & Expression (9 + legacy alias)
  nod_yes: { category: 'observe', defaultDurationMs: 4060, endPoseNote: '四轮接地 · 结束后回站姿', cautionTag: null, sourceTag: '基础库' },
  shake_no: { category: 'observe', defaultDurationMs: 3640, endPoseNote: '四轮接地 · 结束后回站姿', cautionTag: null, sourceTag: '基础库' },
  curious_look: { category: 'observe', defaultDurationMs: 4040, endPoseNote: '四轮接地 · 结束后回站姿', cautionTag: null, sourceTag: '基础库' },
  curious_peek: { category: 'observe', defaultDurationMs: 7140, endPoseNote: '四轮接地 · 交替探头回站姿', cautionTag: null, sourceTag: 'Flip' },
  head_tilt: { category: 'observe', defaultDurationMs: 5620, endPoseNote: '四轮接地 · 歪头观察回站姿', cautionTag: null, sourceTag: 'Flip' },
  listen_tilt: { category: 'observe', defaultDurationMs: 3840, endPoseNote: '四轮接地 · 结束后回站姿', cautionTag: null, sourceTag: '基础库' },
  look_back: { category: 'observe', defaultDurationMs: 4040, endPoseNote: '四轮接地 · 结束后回站姿', cautionTag: null, sourceTag: '基础库' },
  inspect_down: { category: 'observe', defaultDurationMs: 4040, endPoseNote: '四轮接地 · 结束后回站姿', cautionTag: null, sourceTag: '基础库' },
  ready_alert: { category: 'observe', defaultDurationMs: 3640, endPoseNote: '四轮接地 · 警戒压低回站姿', cautionTag: null, sourceTag: '基础库' },
  nod: { category: 'observe', defaultDurationMs: 1600, endPoseNote: '四轮接地 · 结束后回站姿', cautionTag: null, sourceTag: '基础库', previewKey: 'nod_yes' },

  // Body Rhythm (8)
  stand_idle: { category: 'rhythm', defaultDurationMs: 4040, endPoseNote: '四轮接地 · 原地呼吸微摆', cautionTag: null, sourceTag: '基础库' },
  wiggle: { category: 'rhythm', defaultDurationMs: 6720, endPoseNote: '四轮接地 · 后摆扭身回站姿', cautionTag: null, sourceTag: 'Flip' },
  breathing_squat: { category: 'rhythm', defaultDurationMs: 3740, endPoseNote: '四轮接地 · 垂直下蹲回站姿', cautionTag: null, sourceTag: 'Flip' },
  body_sway: { category: 'rhythm', defaultDurationMs: 6960, endPoseNote: '四轮接地 · 横摆联动回站姿', cautionTag: null, sourceTag: 'Flip' },
  side_dip: { category: 'rhythm', defaultDurationMs: 5180, endPoseNote: '四轮接地 · 交替压肩回站姿', cautionTag: null, sourceTag: 'Flip' },
  body_circle: { category: 'rhythm', defaultDurationMs: 10720, endPoseNote: '四轮接地 · 圆周律动回站姿', cautionTag: null, sourceTag: 'Flip' },
  stretch: { category: 'rhythm', defaultDurationMs: 4900, endPoseNote: '四轮接地 · 前后伸展回站姿', cautionTag: null, sourceTag: '基础库' },
  shake_body: { category: 'rhythm', defaultDurationMs: 3240, endPoseNote: '四轮接地 · 抖毛回站姿', cautionTag: null, sourceTag: '基础库' },

  // Stage & Special Posture/Wheel Transitions (10)
  celebrate: { category: 'stage', defaultDurationMs: 4160, endPoseNote: '四轮接地 · 欢快弹跳回站姿', cautionTag: null, sourceTag: '基础库' },
  happy_bounce: { category: 'stage', defaultDurationMs: 6600, endPoseNote: '四轮接地 · 双次弹跳回站姿', cautionTag: null, sourceTag: 'Flip' },
  shake: { category: 'stage', defaultDurationMs: 6820, endPoseNote: '四轮接地 · 快速甩身回站姿', cautionTag: null, sourceTag: 'Flip' },
  figure8: { category: 'stage', defaultDurationMs: 10760, endPoseNote: '四轮接地 · 8字摆动回站姿', cautionTag: null, sourceTag: 'Flip' },
  hip_pop: { category: 'stage', defaultDurationMs: 6060, endPoseNote: '四轮接地 · 髋部节拍回站姿', cautionTag: null, sourceTag: 'Flip' },
  dance: { category: 'stage', defaultDurationMs: 30140, endPoseNote: '四轮接地 · 组合长舞回站姿', cautionTag: '长时', sourceTag: 'Flip' },
  step_back: { category: 'stage', defaultDurationMs: 3700, endPoseNote: '车轮滚动后退约 0.32m', cautionTag: '后退0.32m', sourceTag: '基础库' },
  sit: { category: 'stage', defaultDurationMs: 3240, endPoseNote: '站姿起 · 结束后停在坐姿', cautionTag: '停坐姿', sourceTag: '基础库' },
  sit_wait: { category: 'stage', defaultDurationMs: 6640, endPoseNote: '站姿起 · 结束后停在坐姿', cautionTag: '停坐姿', sourceTag: '基础库' },
  lie_down: { category: 'stage', defaultDurationMs: 5960, endPoseNote: '站姿起 · 结束后停在趴姿', cautionTag: '停趴姿', sourceTag: '基础库' },
});

function formatGestureDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '--';
  return `${(durationMs / 1000).toFixed(1)}s`;
}

export const DEFAULT_THUNDER_GESTURES: readonly HudGestureInput[] = Object.freeze([
  Object.freeze({ name: 'stand_idle', label: '原地待命', durationMs: 4040 }),
  Object.freeze({ name: 'sit_greet', label: '坐下打招呼', durationMs: 13660 }),
  Object.freeze({ name: 'greet_stand', label: '站立打招呼', durationMs: 9240 }),
  Object.freeze({ name: 'offer_paw', label: '站立伸爪', durationMs: 5020 }),
  Object.freeze({ name: 'hello', label: '你好问候', durationMs: 9420 }),
  Object.freeze({ name: 'new_year_bow', label: '拜年鞠躬', durationMs: 12540 }),
  Object.freeze({ name: 'play_bow', label: '玩耍鞠躬', durationMs: 3300 }),
  Object.freeze({ name: 'flip_play_bow', label: '玩耍深鞠躬', durationMs: 16280 }),
  Object.freeze({ name: 'diagonal_curtsy', label: '对角屈身', durationMs: 7040 }),
  Object.freeze({ name: 'nod_yes', label: '点头同意', durationMs: 4060 }),
  Object.freeze({ name: 'shake_no', label: '摇头拒绝', durationMs: 3640 }),
  Object.freeze({ name: 'curious_look', label: '好奇张望', durationMs: 4040 }),
  Object.freeze({ name: 'curious_peek', label: '好奇探头', durationMs: 7140 }),
  Object.freeze({ name: 'head_tilt', label: '歪头观察', durationMs: 5620 }),
  Object.freeze({ name: 'listen_tilt', label: '侧耳倾听', durationMs: 3840 }),
  Object.freeze({ name: 'look_back', label: '回头看', durationMs: 4040 }),
  Object.freeze({ name: 'inspect_down', label: '低头查看', durationMs: 4040 }),
  Object.freeze({ name: 'ready_alert', label: '警戒就绪', durationMs: 3640 }),
  Object.freeze({ name: 'wiggle', label: '后摆扭身', durationMs: 6720 }),
  Object.freeze({ name: 'breathing_squat', label: '呼吸下蹲', durationMs: 3740 }),
  Object.freeze({ name: 'body_sway', label: '机身横摆', durationMs: 6960 }),
  Object.freeze({ name: 'side_dip', label: '侧向压肩', durationMs: 5180 }),
  Object.freeze({ name: 'body_circle', label: '机身画圆', durationMs: 10720 }),
  Object.freeze({ name: 'stretch', label: '伸懒腰', durationMs: 4900 }),
  Object.freeze({ name: 'shake_body', label: '抖毛', durationMs: 3240 }),
  Object.freeze({ name: 'celebrate', label: '庆祝', durationMs: 4160 }),
  Object.freeze({ name: 'happy_bounce', label: '开心弹跳', durationMs: 6600 }),
  Object.freeze({ name: 'shake', label: '快速甩身', durationMs: 6820 }),
  Object.freeze({ name: 'figure8', label: '8字摆动', durationMs: 10760 }),
  Object.freeze({ name: 'hip_pop', label: '髋部弹点', durationMs: 6060 }),
  Object.freeze({ name: 'dance', label: '组合舞蹈', durationMs: 30140 }),
  Object.freeze({ name: 'step_back', label: '后退两步', durationMs: 3700 }),
  Object.freeze({ name: 'sit', label: '坐下', durationMs: 3240 }),
  Object.freeze({ name: 'sit_wait', label: '坐姿待命', durationMs: 6640 }),
  Object.freeze({ name: 'lie_down', label: '趴下', durationMs: 5960 }),
]);

const EXCLUDED_ACTION_LIBRARY_NAMES = new Set([
  'recover',
  'fall_recovery',
  'recovery',
  'self_right',
  'self_righting',
  '摔倒恢复',
]);

export function isActionLibraryGesture(raw: HudGestureInput): boolean {
  const key = (raw.name ?? '').trim().toLowerCase();
  const label = (raw.label ?? '').trim();
  if (!key) return false;
  if (EXCLUDED_ACTION_LIBRARY_NAMES.has(key)) return false;
  if (label === '摔倒恢复' || label.includes('摔倒恢复')) return false;
  return true;
}

export function projectHudGestures(
  gestures: readonly HudGestureInput[],
  category: HudGestureCategoryId = 'all',
  selectedName?: string | null,
): Readonly<{
  allItems: readonly HudGestureProjectedItem[];
  filteredItems: readonly HudGestureProjectedItem[];
  selectedItem: HudGestureProjectedItem | null;
  categoryCounts: Readonly<Record<HudGestureCategoryId, number>>;
}> {
  const counts: Record<HudGestureCategoryId, number> = {
    all: 0,
    social: 0,
    observe: 0,
    rhythm: 0,
    stage: 0,
  };
  const allItems: HudGestureProjectedItem[] = gestures.filter(isActionLibraryGesture).map(raw => {
    const meta = GESTURE_STATIC_META[raw.name];
    const resolvedCategory = meta?.category ?? 'stage';
    const durationMs = typeof raw.durationMs === 'number' && Number.isFinite(raw.durationMs) && raw.durationMs > 0
      ? Math.round(raw.durationMs)
      : meta?.defaultDurationMs ?? 0;
    counts.all += 1;
    counts[resolvedCategory] += 1;
    return {
      name: raw.name,
      label: raw.label || raw.name,
      category: resolvedCategory,
      durationMs,
      durationText: formatGestureDuration(durationMs),
      endPoseNote: meta?.endPoseNote ?? '站姿触发动作',
      cautionTag: meta?.cautionTag ?? null,
      sourceTag: meta?.sourceTag ?? '扩展',
      previewKey: meta?.previewKey ?? raw.name,
    };
  });

  const filteredItems = category === 'all'
    ? allItems
    : allItems.filter(item => item.category === category);
  const effectiveList = filteredItems.length > 0 ? filteredItems : allItems;
  const selectedItem = effectiveList.find(item => item.name === selectedName)
    ?? effectiveList[0]
    ?? null;

  return {
    allItems,
    filteredItems: effectiveList,
    selectedItem,
    categoryCounts: counts,
  };
}

export type HudBodyHeightState = ControlBodyHeightState;

export const BODY_HEIGHT_DEFAULT_MIN_M = 0.15;
export const BODY_HEIGHT_DEFAULT_MAX_M = 0.50;
export const BODY_HEIGHT_DEFAULT_M = 0.375;
export const BODY_HEIGHT_STEP_M = 0.02;

export const DEFAULT_HUD_BODY_HEIGHT: HudBodyHeightState = Object.freeze({
  available: false,
  modeId: null,
  active: false,
  supported: false,
  currentHeightM: null,
  targetHeightM: null,
  defaultHeightM: BODY_HEIGHT_DEFAULT_M,
  minHeightM: BODY_HEIGHT_DEFAULT_MIN_M,
  maxHeightM: BODY_HEIGHT_DEFAULT_MAX_M,
  rateMps: null,
});

export type HudBodyHeightPreset = Readonly<{
  id: 'low' | 'standard' | 'high';
  label: string;
  valueM: number;
  valueText: string;
}>;

export type HudBodyHeightBounds = Readonly<{
  minM: number;
  maxM: number;
  defaultM: number;
  rangeText: string;
  presets: readonly [HudBodyHeightPreset, HudBodyHeightPreset, HudBodyHeightPreset];
}>;

export type HudBodyHeightProjection = Readonly<{
  state: HudBodyHeightState;
  bounds: HudBodyHeightBounds;
  currentText: string;
  targetText: string;
  effectiveTargetM: number;
  modeToggleDisabled: boolean;
  adjustDisabled: boolean;
  decDisabled: boolean;
  incDisabled: boolean;
  activePresetId: HudBodyHeightPreset['id'] | null;
  hint: string | null;
}>;

function roundHeightMeters(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function formatBodyHeightMeters(heightM: number | null | undefined): string {
  if (typeof heightM !== 'number' || !Number.isFinite(heightM) || heightM <= 0) return '--';
  return `${heightM.toFixed(2)} m`;
}

export function resolveBodyHeightBounds(state?: HudBodyHeightState | null): HudBodyHeightBounds {
  const minM = typeof state?.minHeightM === 'number' && Number.isFinite(state.minHeightM) && state.minHeightM > 0
    ? roundHeightMeters(state.minHeightM)
    : BODY_HEIGHT_DEFAULT_MIN_M;
  const maxM = typeof state?.maxHeightM === 'number' && Number.isFinite(state.maxHeightM) && state.maxHeightM > minM
    ? roundHeightMeters(state.maxHeightM)
    : Math.max(roundHeightMeters(minM + 0.1), BODY_HEIGHT_DEFAULT_MAX_M);
  const rawDefault = typeof state?.defaultHeightM === 'number' && Number.isFinite(state.defaultHeightM)
    ? state.defaultHeightM
    : BODY_HEIGHT_DEFAULT_M;
  const defaultM = roundHeightMeters(Math.min(maxM, Math.max(minM, rawDefault)));
  return {
    minM,
    maxM,
    defaultM,
    rangeText: `${minM.toFixed(2)}–${maxM.toFixed(2)} m`,
    presets: [
      { id: 'low', label: '低', valueM: minM, valueText: formatBodyHeightMeters(minM) },
      { id: 'standard', label: '标准', valueM: defaultM, valueText: formatBodyHeightMeters(defaultM) },
      { id: 'high', label: '高', valueM: maxM, valueText: formatBodyHeightMeters(maxM) },
    ],
  };
}

export function clampBodyHeightM(valueM: number, state?: HudBodyHeightState | null): number {
  const bounds = resolveBodyHeightBounds(state);
  if (!Number.isFinite(valueM)) return bounds.defaultM;
  return roundHeightMeters(Math.min(bounds.maxM, Math.max(bounds.minM, valueM)));
}

export function formatBodyHeightRange(state?: HudBodyHeightState | null): string {
  return resolveBodyHeightBounds(state).rangeText;
}

export function projectBodyHeightUi({
  state,
  draftHeightM = null,
  connected,
  faulted,
  leased,
  remoteControlled = false,
  moving,
  busy,
  hasModeCallback,
  hasSetCallback,
}: {
  state?: HudBodyHeightState | null;
  draftHeightM?: number | null;
  connected: boolean;
  faulted: boolean;
  leased: boolean;
  remoteControlled?: boolean;
  moving: boolean;
  busy: boolean;
  hasModeCallback: boolean;
  hasSetCallback: boolean;
}): HudBodyHeightProjection {
  const resolved = state ?? DEFAULT_HUD_BODY_HEIGHT;
  const bounds = resolveBodyHeightBounds(resolved);
  const liveCurrentM = resolved.active && resolved.supported
    && typeof resolved.currentHeightM === 'number' && Number.isFinite(resolved.currentHeightM) && resolved.currentHeightM > 0
    ? resolved.currentHeightM
    : null;
  const liveTargetM = resolved.active && resolved.supported
    && typeof resolved.targetHeightM === 'number' && Number.isFinite(resolved.targetHeightM) && resolved.targetHeightM > 0
    ? resolved.targetHeightM
    : null;
  const effectiveTargetM = typeof draftHeightM === 'number' && Number.isFinite(draftHeightM)
    ? clampBodyHeightM(draftHeightM, resolved)
    : liveTargetM !== null
      ? clampBodyHeightM(liveTargetM, resolved)
      : liveCurrentM !== null
        ? clampBodyHeightM(liveCurrentM, resolved)
        : bounds.defaultM;
  const modeToggleDisabled = !connected || faulted || remoteControlled || leased || moving || busy || !hasModeCallback
    || (!resolved.active && !resolved.available);
  const adjustDisabled = !connected || faulted || remoteControlled || leased || busy || !hasSetCallback
    || !resolved.active || !resolved.supported;
  const decDisabled = adjustDisabled || effectiveTargetM <= bounds.minM + 0.0005;
  const incDisabled = adjustDisabled || effectiveTargetM >= bounds.maxM - 0.0005;

  let activePresetId: HudBodyHeightPreset['id'] | null = null;
  if (resolved.active && resolved.supported) {
    let bestDist = 0.015;
    for (const preset of bounds.presets) {
      const dist = Math.abs(effectiveTargetM - preset.valueM);
      if (dist < bestDist) {
        bestDist = dist;
        activePresetId = preset.id;
      }
    }
  }

  let hint: string | null = null;
  if (!connected) hint = '请先连接机器狗';
  else if (faulted) hint = '存在本体故障';
  else if (remoteControlled) hint = '控制权被占用';
  else if (leased) hint = '请先停止移动';
  else if (moving) hint = '行走中不可调节';
  else if (!resolved.active && !resolved.available) hint = '高度模式未就绪';
  else if (!resolved.active) hint = '请先开启高度模式';
  else if (!resolved.supported) hint = '正在同步高度';

  return {
    state: resolved,
    bounds,
    currentText: formatBodyHeightMeters(liveCurrentM),
    targetText: resolved.active && (liveTargetM !== null || draftHeightM !== null || liveCurrentM !== null)
      ? formatBodyHeightMeters(effectiveTargetM)
      : '--',
    effectiveTargetM,
    modeToggleDisabled,
    adjustDisabled,
    decDisabled,
    incDisabled,
    activePresetId,
    hint,
  };
}
