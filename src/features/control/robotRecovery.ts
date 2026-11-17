import type { BrainstemGrpcProfile } from '../../services/brainstemGrpc';
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { controlTerrainSwitchBlock, type ControlRuntimeState } from './controlOperations.ts';

export type RobotRecoveryPhase = 'unspecified' | 'absent' | 'selected' | 'enabled' | 'getting-up' | 'stable-stand' | 'exiting';
export type RobotRecoveryReason =
  | 'none' | 'unavailable' | 'model-not-configured' | 'enable-sequence-unverified' | 'walking'
  | 'not-selected' | 'not-stable' | 'heartbeat-expired' | 'precondition';
export type RobotRecoveryCommand = 'enter' | 'enable' | 'start' | 'cancel' | 'exit';

export type RobotRecoveryStatus = Readonly<{
  service: 'ready' | 'missing' | 'unavailable' | 'unread';
  phase: RobotRecoveryPhase;
  sessionSelected: boolean;
  modelConfigured: boolean | null;
  enableSequenceVerified: boolean | null;
  stableStand: boolean;
  locomotionAvailable: boolean;
  activeModeId: string | null;
  reason: RobotRecoveryReason;
  detail: string;
  heartbeatFresh: boolean | null;
  heartbeatError: string | null;
}>;

export type RobotRecoveryActionState = Readonly<{ enabled: boolean; reason: string | null }>;
export type RobotRecoveryPresentation = Readonly<{
  title: '摔倒恢复';
  phaseLabel: string;
  reason: string | null;
  heartbeatLabel: string | null;
  actions: Readonly<Record<RobotRecoveryCommand, RobotRecoveryActionState>>;
  confirms: Readonly<{ enable: string; start: string }>;
}>;

const PHASES: readonly RobotRecoveryPhase[] = ['unspecified', 'absent', 'selected', 'enabled', 'getting-up', 'stable-stand', 'exiting'];
const REASONS: readonly RobotRecoveryReason[] = ['none', 'unavailable', 'model-not-configured', 'enable-sequence-unverified', 'walking', 'not-selected', 'not-stable', 'heartbeat-expired', 'precondition'];

const PHASE_LABELS: Record<RobotRecoveryPhase, string> = {
  unspecified: '状态未知',
  absent: '未进入',
  selected: '已进入，等待使能',
  enabled: '已使能，等待起立',
  'getting-up': '正在起立',
  'stable-stand': '已稳定站立',
  exiting: '正在退出',
};

const REASON_TEXT: Record<Exclude<RobotRecoveryReason, 'none'>, string> = {
  unavailable: '摔倒恢复当前不可用',
  'model-not-configured': '摔倒恢复模型尚未配置',
  'enable-sequence-unverified': '使能顺序尚未核验，暂时不能使能',
  walking: '站立或趴地时可进入摔倒恢复；行走中不可切换。',
  'not-selected': '尚未进入摔倒恢复',
  'not-stable': '尚未稳定站立，还不能交回运动',
  'heartbeat-expired': '恢复心跳已超时',
  precondition: '机器人拒绝了这次摔倒恢复操作',
};

export const ROBOT_RECOVERY_CONFIRMATION = Object.freeze({
  enable: '使能恢复会让机器狗开始动作。请确认周围安全，急停可用。',
  start: '摔倒起立会让机器狗从倒地姿态起身。请确认周围安全，急停可用。',
});

export function emptyRecoveryStatus(service: RobotRecoveryStatus['service'] = 'unread'): RobotRecoveryStatus {
  return {
    service, phase: 'unspecified', sessionSelected: false, modelConfigured: null, enableSequenceVerified: null,
    stableStand: false, locomotionAvailable: false, activeModeId: null, reason: 'none', detail: '',
    heartbeatFresh: null, heartbeatError: null,
  };
}

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length <= max && !value.includes('\0') ? value : null;
}

export function projectRobotRecoveryStatus(raw: unknown): RobotRecoveryStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  if (!PHASES.includes(value.phase as RobotRecoveryPhase) || !REASONS.includes(value.reason as RobotRecoveryReason)) return null;
  if (typeof value.sessionSelected !== 'boolean' || typeof value.modelConfigured !== 'boolean'
    || typeof value.enableSequenceVerified !== 'boolean' || typeof value.stableStand !== 'boolean'
    || typeof value.locomotionAvailable !== 'boolean') return null;
  const activeModeId = text(value.activeModeId, 64);
  const detail = text(value.detail, 200);
  if (activeModeId === null || detail === null) return null;
  const heartbeatFresh = value.heartbeatFresh === undefined ? null : value.heartbeatFresh === true ? true : value.heartbeatFresh === false ? false : null;
  if (value.heartbeatFresh !== undefined && heartbeatFresh === null) return null;
  const heartbeatError = value.heartbeatError === undefined || value.heartbeatError === null ? null : text(value.heartbeatError, 40);
  if (value.heartbeatError !== undefined && value.heartbeatError !== null && heartbeatError === null) return null;
  return {
    service: 'ready',
    phase: value.phase as RobotRecoveryPhase,
    sessionSelected: value.sessionSelected,
    modelConfigured: value.modelConfigured,
    enableSequenceVerified: value.enableSequenceVerified,
    stableStand: value.stableStand,
    locomotionAvailable: value.locomotionAvailable,
    activeModeId: activeModeId.length ? activeModeId : null,
    reason: value.reason as RobotRecoveryReason,
    detail,
    heartbeatFresh,
    heartbeatError,
  };
}

function recoveryCapability(profile: BrainstemGrpcProfile | null | undefined) {
  return profile?.modeCapabilities?.find(item => item.id === 'recovery' && item.kind === 'recovery-action') ?? null;
}

function blocked(reason: string): RobotRecoveryActionState {
  return { enabled: false, reason };
}

function open(): RobotRecoveryActionState {
  return { enabled: true, reason: null };
}

export function presentRobotRecovery(input: {
  status: RobotRecoveryStatus | null;
  profile?: BrainstemGrpcProfile | null;
  runtimeState?: ControlRuntimeState;
}): RobotRecoveryPresentation {
  const status = input.status ?? emptyRecoveryStatus();
  const walking = controlTerrainSwitchBlock(input.runtimeState);
  const capability = recoveryCapability(input.profile);
  let reason: string | null = null;
  if (!input.status) reason = '请先连接机器人';
  else if (status.service === 'missing') reason = '机器人尚未提供摔倒恢复服务';
  else if (status.service === 'unavailable') reason = '无法读取摔倒恢复状态';
  else if (status.service === 'unread') reason = '正在读取摔倒恢复状态';
  else if (!input.profile?.modeCapabilities) reason = '当前连接未声明摔倒恢复能力';
  else if (!capability) reason = '当前策略没有摔倒恢复';
  else if (!capability.available) reason = capability.unavailableReason || REASON_TEXT.unavailable;
  else if (status.modelConfigured === false || status.reason === 'model-not-configured') reason = REASON_TEXT['model-not-configured'];
  else if (walking) reason = walking;
  else if (status.sessionSelected && (status.reason === 'heartbeat-expired' || status.heartbeatError === 'timeout' || status.heartbeatError === 'unavailable')) reason = REASON_TEXT['heartbeat-expired'];
  else if (status.reason !== 'none') reason = status.detail || REASON_TEXT[status.reason];

  const serviceBlocked = status.service !== 'ready' || !capability?.available || status.modelConfigured === false;
  const canEnter = !serviceBlocked && !walking && !status.sessionSelected;
  const canEnable = status.service === 'ready' && status.sessionSelected && status.modelConfigured === true && status.enableSequenceVerified === true
    && (status.phase === 'selected' || status.phase === 'enabled');
  const canStart = status.service === 'ready' && status.phase === 'enabled' && status.modelConfigured === true && status.enableSequenceVerified === true;
  const stable = status.phase === 'stable-stand' || status.stableStand || status.locomotionAvailable;
  const canExit = status.service === 'ready' && status.sessionSelected && stable;
  const canCancel = status.service === 'ready' && status.sessionSelected && !stable;
  const enableReason = status.enableSequenceVerified === false ? REASON_TEXT['enable-sequence-unverified'] : reason;

  return {
    title: '摔倒恢复',
    phaseLabel: status.service === 'ready' ? PHASE_LABELS[status.phase] : '未同步',
    reason,
    heartbeatLabel: status.sessionSelected ? (status.heartbeatFresh ? '心跳正常' : '心跳未确认') : null,
    actions: {
      enter: canEnter ? open() : blocked(reason ?? '当前不能进入摔倒恢复'),
      enable: canEnable ? open() : blocked(enableReason ?? '当前不能使能恢复'),
      start: canStart ? open() : blocked(reason ?? '当前不能开始摔倒起立'),
      cancel: canCancel ? open() : blocked(stable ? '已稳定站立，请交回运动' : '尚未进入摔倒恢复'),
      exit: canExit ? open() : blocked(REASON_TEXT['not-stable']),
    },
    confirms: ROBOT_RECOVERY_CONFIRMATION,
  };
}
