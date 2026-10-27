export type ControlOperation = 'stop' | 'stand' | 'sit' | 'enableMotor' | 'disableMotor' | 'switchPolicy';
export type ControlActionReadiness = Readonly<{ ready: boolean; blockedReason?: string }>;
export type ControlPolicyOption = Readonly<{ id: string; label: string }>;
export type ControlTerrainModeId = 'flat' | 'stairs' | 'platform';
export type ControlTerrainModeOption = Readonly<{ id: ControlTerrainModeId; label: string }>;
export type ControlTerrainModeState = Readonly<{
  current: ControlTerrainModeId | null;
  options: readonly ControlTerrainModeOption[];
  catalogStatus: 'unknown' | 'unavailable' | 'synced';
  source: 'device' | 'unknown';
  updatedAt?: string | null;
}>;
export type ControlOperationStatus = 'idle' | 'blocked' | 'submitted' | 'accepted' | 'executing' | 'completed' | 'failed' | 'timeout';
export type ControlOperationState = Readonly<{ status: ControlOperationStatus; detail?: string; updatedAt?: string }>;
export type ControlInputSource = 'touch' | 'physical';
export type ControlSpeedState = Readonly<{
  linearMps: number | null;
  lateralMps: number | null;
  yawRps: number | null;
  source: 'device' | 'command' | 'unknown';
  updatedAt?: string | null;
}>;
export type ControlBatteryState = Readonly<{
  percent: number | null;
  /** Brainstem currently exposes motor-bus voltage, not battery SOC. */
  voltageV?: number | null;
  source: 'device' | 'unknown';
  updatedAt?: string | null;
}>;
export type ControlSignalState = Readonly<{
  rssiDbm?: number | null;
  qualityPercent?: number | null;
  source: 'device' | 'controller' | 'unknown';
  updatedAt?: string | null;
}>;
export type ControlJointState = Readonly<{
  id: string;
  label: string;
  online?: boolean | null;
  statusCode?: number | null;
  positionDeg?: number | null;
  velocityRps?: number | null;
  torqueNm?: number | null;
  voltageV?: number | null;
  temperatureC?: number | null;
  errors?: readonly number[];
  fault?: 'unknown' | 'clear' | 'active';
  source: 'device' | 'unknown';
  updatedAt?: string | null;
}>;
export type ControlRuntimeState = Readonly<{
  controlLink?: 'unknown' | 'disconnected' | 'connected';
  controlAuthority?: 'unknown' | 'not-held' | 'held';
  posture?: 'unknown' | 'standing' | 'sitting';
  motorState?: 'unknown' | 'enabled' | 'disabled';
  deviceIdentity?: 'unknown' | 'unbound' | 'bound-unverified' | 'verified';
  faultStatus?: 'unknown' | 'clear' | 'active';
  faultSummary?: string;
  speed?: ControlSpeedState;
  battery?: ControlBatteryState;
  signal?: ControlSignalState;
  joints?: readonly ControlJointState[];
  inputSource?: ControlInputSource;
  currentPolicy?: ControlPolicyOption | null;
  policyCatalogStatus?: 'unknown' | 'unavailable' | 'synced';
  policyOptions?: readonly ControlPolicyOption[];
  /**
   * Terrain modes are an optional projection of a verified Brainstem profile
   * catalogue. They are never inferred from posture, speed, or a button press.
   */
  terrainMode?: ControlTerrainModeState;
}>;
export type ControlOperationCallbacks = Readonly<{
  stop?: () => void | Promise<void>;
  stand?: () => void | Promise<void>;
  sit?: () => void | Promise<void>;
  enableMotor?: () => void | Promise<void>;
  disableMotor?: () => void | Promise<void>;
  switchPolicy?: (policyId: string) => void | Promise<void>;
}>;

export const controlOperationLabels: Readonly<Record<ControlOperation, string>> = {
  stop: '停止', stand: '站立', sit: '坐下', enableMotor: '使能电机', disableMotor: '失能电机', switchPolicy: '切换策略模型',
};

export const controlOperationStatusLabels: Readonly<Record<ControlOperationStatus, string>> = {
  idle: '待命', blocked: '未接入', submitted: '已提交', accepted: '已接受', executing: '执行中',
  completed: '已完成', failed: '失败', timeout: '超时',
};

export const CONTROL_TERRAIN_MODE_OPTIONS: readonly ControlTerrainModeOption[] = Object.freeze([
  Object.freeze({ id: 'flat', label: '平地模式' }),
  Object.freeze({ id: 'stairs', label: '楼梯模式' }),
  Object.freeze({ id: 'platform', label: '高台模式' }),
]);

// These are the agreed Brainstem profile IDs, not model-filename guesses.
// Register them in the device catalogue before offering an executable mode.
export function getControlTerrainPolicies(state?: ControlRuntimeState) {
  const policies = getControlPolicyOptions(state);
  return CONTROL_TERRAIN_MODE_OPTIONS.map(mode => {
    const policy = policies.find(candidate => candidate.id === mode.id);
    return { ...mode, profileId: policy?.id ?? null,
      selected: Boolean(policy && state?.currentPolicy?.id === policy.id) };
  });
}

export function getControlTerrainModeOptions(state?: ControlRuntimeState): readonly ControlTerrainModeOption[] {
  if (state?.terrainMode?.catalogStatus !== 'synced') return [];
  const seen = new Set<ControlTerrainModeId>();
  return (state.terrainMode.options ?? []).filter(option => {
    if (!CONTROL_TERRAIN_MODE_OPTIONS.some(candidate => candidate.id === option?.id)
      || typeof option.label !== 'string' || !option.label.trim() || seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

const CONTROL_OPERATION_TRANSITIONS: Readonly<Record<ControlOperationStatus, readonly ControlOperationStatus[]>> = {
  idle: ['blocked', 'submitted'],
  blocked: ['idle', 'submitted'],
  submitted: ['accepted', 'failed', 'timeout'],
  accepted: ['executing', 'failed', 'timeout', 'submitted'],
  executing: ['completed', 'failed', 'timeout'],
  completed: ['idle', 'submitted'],
  failed: ['idle', 'submitted'],
  timeout: ['idle', 'submitted'],
};

/**
 * Pure state-machine guard for action feedback. It never performs transport
 * work; callers must still validate capability and callback ownership before
 * dispatching. Invalid or out-of-order ACK states are retained unchanged.
 */
export function transitionControlOperationState(
  current: ControlOperationState,
  next: ControlOperationStatus,
  detail?: string,
): { accepted: boolean; state: ControlOperationState } {
  if (!CONTROL_OPERATION_TRANSITIONS[current.status]?.includes(next)) {
    return { accepted: false, state: current };
  }
  return {
    accepted: true,
    state: { status: next, ...(detail ? { detail } : {}), updatedAt: new Date().toISOString() },
  };
}

// Only an explicitly supplied, synchronized device catalogue can offer policies.
export function getControlPolicyOptions(state?: ControlRuntimeState): readonly ControlPolicyOption[] {
  if (state?.policyCatalogStatus !== 'synced') return [];
  const seen = new Set<string>();
  return (state.policyOptions ?? []).filter(option => {
    if (typeof option?.id !== 'string' || !option.id.trim() || typeof option.label !== 'string' || !option.label.trim() || seen.has(option.id)) return false;
    seen.add(option.id); return true;
  });
}

export function getControlOperationReadiness({ action, readiness, callbacks, runtimeState, foreground, leaving, inFlight, policyId }: {
  action: ControlOperation;
  readiness?: Partial<Record<ControlOperation, ControlActionReadiness>>;
  callbacks?: ControlOperationCallbacks;
  runtimeState?: ControlRuntimeState;
  foreground: boolean;
  leaving: boolean;
  inFlight: boolean;
  policyId?: string;
}): ControlActionReadiness {
  if (!foreground) return { ready: false, blockedReason: '应用不在前台，操作已暂停。' };
  if (leaving) return { ready: false, blockedReason: '正在离开控制中心，操作已撤销。' };
  if (inFlight) return { ready: false, blockedReason: '上一项操作尚未结束，请等待设备响应。' };
  if (readiness?.[action]?.ready !== true) return { ready: false, blockedReason: readiness?.[action]?.blockedReason || `${controlOperationLabels[action]}尚未接通，请检查连接与控制权限。` };
  if (typeof callbacks?.[action] !== 'function') return { ready: false, blockedReason: `应用尚未接通${controlOperationLabels[action]}操作链路。` };
  if (action === 'switchPolicy') {
    const options = getControlPolicyOptions(runtimeState);
    if (!options.length) return { ready: false, blockedReason: '尚未读取机器人策略列表，暂无可切换策略。' };
    if (policyId !== undefined && !options.some(option => option.id === policyId)) return { ready: false, blockedReason: '所选策略已不可用，请重新同步策略目录。' };
  }
  return { ready: true };
}
