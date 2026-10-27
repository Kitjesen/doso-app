export const ROBOT_DIAGNOSTICS_COMMAND = 'diagnostics.health_check' as const;
export const ROBOT_DIAGNOSTICS_TELEMETRY_TTL_MS = 30_000;
export const ROBOT_DIAGNOSTICS_COMMAND_TTL_MS = 15_000;

export type RobotDiagnosticsDeviceClass = 'demo' | 'physical';
export type RobotDiagnosticsStatus =
  | 'idle'
  | 'queued'
  | 'published'
  | 'accepted'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'cancelled'
  | 'hardware_unavailable';

export type RobotDiagnosticsAckStatus = 'accepted' | 'executing' | 'succeeded' | 'failed';
export type RobotDiagnosticsFailureCode = 'HEALTH_CHECK_FAILED' | 'SENSOR_NOT_READY';

export interface RobotDiagnosticsClock {
  nowMs(): number;
}

export interface RobotDiagnosticsErrorDto {
  code: 'ACK_REJECTED' | 'HEALTH_CHECK_FAILED' | 'SENSOR_NOT_READY';
  message: string;
}

export interface RobotDiagnosticsTrustedSnapshotDto {
  batteryPercent: number;
  heartbeatAtMs: number;
  receivedAtMs: number;
  sensorSummary: '正常' | '需检查';
}

export interface RobotDiagnosticsAckDto {
  authenticated: boolean;
  commandId: string;
  failureCode?: RobotDiagnosticsFailureCode;
  snapshot?: RobotDiagnosticsTrustedSnapshotDto;
  status: RobotDiagnosticsAckStatus;
}

export interface RobotDiagnosticsStateDto {
  command: typeof ROBOT_DIAGNOSTICS_COMMAND;
  commandId: string | null;
  deviceClass: RobotDiagnosticsDeviceClass;
  expiresAtMs: number | null;
  lastError: RobotDiagnosticsErrorDto | null;
  status: RobotDiagnosticsStatus;
  trustedSnapshot: RobotDiagnosticsTrustedSnapshotDto | null;
}

export interface RobotDiagnosticsSnapshotPresentationDto {
  batteryPercent: number;
  heartbeatAtMs: number;
  label: '模拟可信遥测';
  online: boolean;
  receivedAtMs: number;
  sensorSummary: '正常' | '需检查';
}

export interface RobotDiagnosticsPresentationDto {
  actionLabel: string;
  available: boolean;
  error: RobotDiagnosticsErrorDto | null;
  message: string;
  snapshot: RobotDiagnosticsSnapshotPresentationDto | null;
  status: RobotDiagnosticsStatus;
  statusLabel: string;
}

export interface RobotDiagnosticsGateway {
  cancel(state: RobotDiagnosticsStateDto): RobotDiagnosticsStateDto;
  create(deviceClass: RobotDiagnosticsDeviceClass): RobotDiagnosticsStateDto;
  expire(state: RobotDiagnosticsStateDto): RobotDiagnosticsStateDto;
  nowMs(): number;
  present(state: RobotDiagnosticsStateDto): RobotDiagnosticsPresentationDto;
  projectAck(state: RobotDiagnosticsStateDto, ack: RobotDiagnosticsAckDto): RobotDiagnosticsStateDto;
  publish(state: RobotDiagnosticsStateDto): RobotDiagnosticsStateDto;
  queue(state: RobotDiagnosticsStateDto): RobotDiagnosticsStateDto;
}

const STATUS_LABELS: Record<RobotDiagnosticsStatus, string> = {
  idle: '等待开始',
  queued: '已排队',
  published: '已发布（等待设备 ACK）',
  accepted: '设备已接受',
  executing: '设备执行中',
  succeeded: '设备 ACK：检查完成',
  failed: '设备 ACK：检查失败',
  expired: '指令已过期',
  cancelled: '检查已取消',
  hardware_unavailable: '真实协议 / 硬件未接入',
};

const STATUS_MESSAGES: Record<RobotDiagnosticsStatus, string> = {
  idle: '仅运行非运动健康检查模拟，不会启用手动、巡航、任务或召回控制。',
  queued: '模拟健康检查已进入本地队列，尚未发布。',
  published: '指令已模拟发布；发布不代表成功，正在等待认证设备 ACK。',
  accepted: '已收到认证设备接受 ACK，尚未完成。',
  executing: '已收到认证设备执行 ACK，尚未完成。',
  succeeded: '仅在认证投影的设备完成 ACK 后显示完成。',
  failed: '认证设备 ACK 报告健康检查失败。',
  expired: '等待认证设备 ACK 超时，本次模拟没有成功。',
  cancelled: '本次非运动健康检查模拟已取消。',
  hardware_unavailable: '真实设备 diagnostics.health_check 的认证 ACK 与硬件健康协议尚未接入；模拟不可用，生产控制保持锁定。',
};

const TERMINAL_STATUSES = new Set<RobotDiagnosticsStatus>(['succeeded', 'failed', 'expired', 'cancelled']);

function expireIfDue(state: RobotDiagnosticsStateDto, nowMs: number): RobotDiagnosticsStateDto {
  if (
    state.deviceClass === 'demo'
    && !TERMINAL_STATUSES.has(state.status)
    && state.status !== 'idle'
    && state.expiresAtMs !== null
    && nowMs >= state.expiresAtMs
  ) {
    return { ...state, lastError: null, status: 'expired', trustedSnapshot: null };
  }
  return state;
}

function safeFailure(code: RobotDiagnosticsFailureCode): RobotDiagnosticsErrorDto {
  return code === 'SENSOR_NOT_READY'
    ? { code, message: '模拟传感器尚未就绪。' }
    : { code, message: '模拟健康检查未通过。' };
}

function assertDemo(state: RobotDiagnosticsStateDto): void {
  if (state.deviceClass !== 'demo' || state.status === 'hardware_unavailable') {
    throw new Error('真实设备诊断必须等待认证设备 ACK 与硬件健康协议接入。');
  }
}

function isFresh(snapshot: RobotDiagnosticsTrustedSnapshotDto, nowMs: number): boolean {
  const ageMs = nowMs - snapshot.receivedAtMs;
  return Number.isFinite(ageMs) && ageMs >= 0 && ageMs <= ROBOT_DIAGNOSTICS_TELEMETRY_TTL_MS;
}

function isSnapshotValid(snapshot: RobotDiagnosticsTrustedSnapshotDto | undefined): snapshot is RobotDiagnosticsTrustedSnapshotDto {
  return Boolean(
    snapshot
      && Number.isFinite(snapshot.batteryPercent)
      && snapshot.batteryPercent >= 0
      && snapshot.batteryPercent <= 100
      && Number.isFinite(snapshot.heartbeatAtMs)
      && Number.isFinite(snapshot.receivedAtMs)
      && (snapshot.sensorSummary === '正常' || snapshot.sensorSummary === '需检查'),
  );
}

export function createRobotDiagnosticsGateway(clock: RobotDiagnosticsClock): RobotDiagnosticsGateway {
  let sequence = 0;
  return {
    nowMs: () => clock.nowMs(),

    create(deviceClass) {
      return {
        command: ROBOT_DIAGNOSTICS_COMMAND,
        commandId: null,
        deviceClass,
        expiresAtMs: null,
        lastError: null,
        status: deviceClass === 'demo' ? 'idle' : 'hardware_unavailable',
        trustedSnapshot: null,
      };
    },

    queue(state) {
      assertDemo(state);
      const nowMs = clock.nowMs();
      sequence += 1;
      return {
        ...state,
        commandId: `demo-health-${nowMs}-${sequence}`,
        expiresAtMs: nowMs + ROBOT_DIAGNOSTICS_COMMAND_TTL_MS,
        lastError: null,
        status: 'queued',
        trustedSnapshot: null,
      };
    },

    publish(state) {
      assertDemo(state);
      const current = expireIfDue(state, clock.nowMs());
      if (current.status === 'expired') return current;
      if (current.status !== 'queued') throw new Error('只有已排队的模拟健康检查可以发布。');
      return { ...current, status: 'published' };
    },

    projectAck(state, ack) {
      assertDemo(state);
      const current = expireIfDue(state, clock.nowMs());
      if (current.status === 'expired') return current;
      if (!ack.authenticated || !current.commandId || ack.commandId !== current.commandId) {
        return {
          ...current,
          lastError: { code: 'ACK_REJECTED', message: '未认证或不匹配的设备 ACK 已忽略。' },
        };
      }
      if (TERMINAL_STATUSES.has(current.status)) return current;
      if (ack.status === 'accepted' && current.status === 'published') {
        return { ...current, lastError: null, status: 'accepted' };
      }
      if (ack.status === 'executing' && current.status === 'accepted') {
        return { ...current, lastError: null, status: 'executing' };
      }
      if (ack.status === 'failed' && ['published', 'accepted', 'executing'].includes(current.status)) {
        return {
          ...current,
          lastError: safeFailure(ack.failureCode ?? 'HEALTH_CHECK_FAILED'),
          status: 'failed',
          trustedSnapshot: null,
        };
      }
      if (ack.status === 'succeeded' && current.status === 'executing' && isSnapshotValid(ack.snapshot)) {
        return { ...current, lastError: null, status: 'succeeded', trustedSnapshot: { ...ack.snapshot } };
      }
      return {
        ...current,
        lastError: { code: 'ACK_REJECTED', message: '设备 ACK 顺序或内容无效，未改变检查结果。' },
      };
    },

    expire(state) {
      assertDemo(state);
      return expireIfDue(state, clock.nowMs());
    },

    cancel(state) {
      assertDemo(state);
      if (TERMINAL_STATUSES.has(state.status) || state.status === 'idle') return state;
      return { ...state, lastError: null, status: 'cancelled', trustedSnapshot: null };
    },

    present(state) {
      const nowMs = clock.nowMs();
      const snapshot = state.status === 'succeeded' && state.trustedSnapshot && isFresh(state.trustedSnapshot, nowMs)
        ? {
          ...state.trustedSnapshot,
          label: '模拟可信遥测' as const,
          online: true,
        }
        : null;
      return {
        actionLabel: '开始非运动健康检查模拟',
        available: state.deviceClass === 'demo',
        error: state.lastError,
        message: STATUS_MESSAGES[state.status],
        snapshot,
        status: state.status,
        statusLabel: STATUS_LABELS[state.status],
      };
    },
  };
}
