export const ROBOT_CAPABILITIES = [
  'diagnosticsHealth',
  'provisioning',
  'ota',
  'routeStart',
  'taskStart',
  'recall',
  'manualControl',
] as const;

export type RobotCapability = (typeof ROBOT_CAPABILITIES)[number];

export type RobotCapabilityGate = Readonly<{
  available: boolean;
  reason?: string;
}>;

export type RobotCapabilityReadiness = Readonly<Record<RobotCapability, RobotCapabilityGate>>;

export type RobotCapabilityEvidence = Readonly<Partial<Record<RobotCapability, boolean>>>;

export type RobotCapabilityContext = Readonly<{
  connected: boolean;
  deviceClass: 'demo' | 'physical';
  hasDevice: boolean;
  safetyLock: boolean;
  evidence?: RobotCapabilityEvidence;
}>;

export const ROBOT_CAPABILITY_UNAVAILABLE_REASONS: Readonly<Record<RobotCapability, string>> = Object.freeze({
  diagnosticsHealth: '真实设备 diagnostics.health_check 的认证 ACK 与硬件健康协议尚未接入。',
  provisioning: '当前仅有模拟配网 gateway；真实 GATT 身份验证与一次性 Wi-Fi 写入尚未接入。',
  ota: '当前仅有离线 OTA 生命周期模拟；生产签名制品、托管作业与机器人回滚尚未接入。',
  routeStart: '实体机器人路线协议、可信定位与路线执行 ACK 尚未接入。',
  taskStart: '实体机器人任务协议、可信任务状态与执行 ACK 尚未接入。',
  recall: '实体机器人召回协议、可信定位与安全返航 ACK 尚未接入。',
  manualControl: '实体机器人手动控制协议、设备密钥与运动安全链路尚未接入。',
});

const MOTION_CAPABILITIES = new Set<RobotCapability>([
  'routeStart',
  'taskStart',
  'recall',
  'manualControl',
]);

const EMPTY_EVIDENCE: Readonly<Record<RobotCapability, boolean>> = Object.freeze({
  diagnosticsHealth: false,
  provisioning: false,
  ota: false,
  routeStart: false,
  taskStart: false,
  recall: false,
  manualControl: false,
});

export const PHYSICAL_ROBOT_CAPABILITY_EVIDENCE = EMPTY_EVIDENCE;

export const DEMO_ROBOT_CAPABILITY_EVIDENCE: Readonly<Record<RobotCapability, boolean>> = Object.freeze({
  ...EMPTY_EVIDENCE,
  diagnosticsHealth: true,
});

export function createRobotCapabilityReadiness(context: RobotCapabilityContext): RobotCapabilityReadiness {
  const evidence = context.deviceClass === 'demo'
    ? DEMO_ROBOT_CAPABILITY_EVIDENCE
    : { ...PHYSICAL_ROBOT_CAPABILITY_EVIDENCE, ...context.evidence };

  return Object.freeze(Object.fromEntries(
    ROBOT_CAPABILITIES.map((capability) => [capability, evaluateCapability(capability, evidence[capability], context)]),
  ) as Record<RobotCapability, RobotCapabilityGate>);
}

function evaluateCapability(
  capability: RobotCapability,
  hasTrustedEvidence: boolean,
  context: RobotCapabilityContext,
): RobotCapabilityGate {
  if (!hasTrustedEvidence) {
    return Object.freeze({ available: false, reason: ROBOT_CAPABILITY_UNAVAILABLE_REASONS[capability] });
  }

  if (!MOTION_CAPABILITIES.has(capability)) return Object.freeze({ available: true });
  if (!context.hasDevice) return Object.freeze({ available: false, reason: '当前账户尚未绑定设备，请先完成设备选择。' });
  if (!context.connected) return Object.freeze({ available: false, reason: '设备当前未连接，请先在“我的设备”中恢复连接。' });
  if (context.safetyLock) return Object.freeze({ available: false, reason: '安全锁已启用，请先在“我的设备”中关闭安全锁。' });
  return Object.freeze({ available: true });
}
