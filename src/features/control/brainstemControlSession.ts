import type { BrainstemControlAction, BrainstemControlReply, BrainstemControlTransport, BrainstemGesture } from '../../services/brainstemControl';
import type { ControlImuReading } from './controlOperations';
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { projectBrainstemImu } from '../../services/brainstemImu.ts';
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { emptyRecoveryStatus, type RobotRecoveryCommand, type RobotRecoveryStatus } from './robotRecovery.ts';
import type { BrainstemGrpcEndpoint, BrainstemGrpcProfile, BrainstemGrpcStatus } from '../../services/brainstemGrpc';
import type { ControlActionReadiness, ControlOperation, ControlRuntimeState } from './controlOperations';
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { currentPolicyFromProfile, profileOptions, terrainModeFromProfile } from '../../services/directRobotConnection.ts';
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { recoveryModeFromProfile } from './robotModeCapabilities.ts';

export type BrainstemControlState = Readonly<{
  phase: 'disconnected' | 'connecting' | 'ready' | 'operating' | 'armed' | 'error';
  connected: boolean;
  leaseActive: boolean;
  manualPrepared: boolean;
  principalVerified: boolean;
  leaseOwnerMatched: boolean;
  transport: 'grpc-mtls' | 'grpc-lan' | null;
  clientIdentitySelected: boolean;
  mutualTlsVerified: boolean;
  status: BrainstemGrpcStatus | null;
  profile: BrainstemGrpcProfile | null;
  profileObservedAt: number | null;
  error: string | null;
  failureCode: string | null;
  sequence: number;
  observedAt: number | null;
}>;
export type ControlVector = Readonly<{ x: number; y: number }>;
const initial = (): BrainstemControlState => ({ phase: 'disconnected', connected: false, leaseActive: false, manualPrepared: false,
  principalVerified: false, leaseOwnerMatched: false, transport: null, clientIdentitySelected: false, mutualTlsVerified: false, status: null, profile: null, profileObservedAt: null, error: null, failureCode: null, sequence: 0, observedAt: null });
const FRESH_MS = 1500;
const PROFILE_FRESH_MS = 5000;
const INPUT_FRESH_MS = 150;
const INPUT_PERIOD_MS = 20;
const IDLE_ZERO_PERIOD_MS = 100;
const failureCodes = new Set(['config', 'native_unavailable', 'invalid_response', 'unauthorized', 'precondition',
  'busy', 'background', 'cancelled', 'timeout', 'unavailable', 'stop_unconfirmed', 'stale_input', 'not_armed',
  'command_rejected', 'unimplemented', 'ack_mismatch']);
// No wall-clock fallback: an unavailable monotonic clock makes freshness fail closed.
const elapsedNow = (): number => {
  try {
    const at = typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now() : NaN;
    return Number.isFinite(at) && at >= 0 ? at : NaN;
  } catch { return NaN; }
};
const neutral = (): ControlVector => ({ x: 0, y: 0 });
const nonzero = (vector: ControlVector) => vector.x !== 0 || vector.y !== 0;
const STOP_UNCONFIRMED_MESSAGE = '停止请求未确认，请检查机器狗状态并使用硬件急停。';
const failureMessage = (error: unknown) => error && typeof error === 'object' && 'code' in error
  && error.code === 'unauthorized' ? '此客户端身份未获机器狗授权，请检查配对。'
  : error && typeof error === 'object' && 'code' in error && error.code === 'stop_unconfirmed'
    ? STOP_UNCONFIRMED_MESSAGE
  : error && typeof error === 'object' && 'code' in error && error.code === 'unimplemented'
    ? '机器人服务未开放此操作。'
  : error && typeof error === 'object' && 'code' in error && error.code === 'precondition'
    ? '机器人当前状态不允许此操作。'
  : error && typeof error === 'object' && 'code' in error && error.code === 'timeout'
    ? '控制请求超时，连接已断开，请检查机器人状态。'
  : '控制已断开，请重新连接';

/** Owns one foreground connection. No credentials, lease tokens or input replay in JS. */
export class BrainstemControlSession {
  state: BrainstemControlState = initial();
  private listeners = new Set<() => void>();
  private epoch = 0;
  private sessionId: string | null = null;
  private retired = false;
  private stopUnconfirmed = false;
  private authorityTouched = false;
  private settling = 0;
  private verifiedConnection = 0;
  private busy = false;
  private pendingAction: object | null = null;
  private reading = false;
  private readDone: Promise<void> | null = null;
  private interrupting: { id: string | null; epoch: number; promise: Promise<void> } | null = null;
  private inputBusy = false;
  private lastInputSentAt: number | null = null;
  private pendingInput: { id: string; epoch: number; drive: ControlVector; turn: ControlVector;
    driveAt: number; turnAt: number; observedAt: number; sampledAtMonotonicMs?: number } | null = null;
  private acquiring = false;
  private driveVector = neutral();
  private commandSpeed = { linearMps: 0, lateralMps: 0, yawRps: 0 };
  private turnVector = neutral();
  private driveAt = 0;
  private turnAt = 0;
  private inputAt = 0;
  private moving = false;
  private idleTouchLease = false;
  private idleZeroAt = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private imu: ControlImuReading | null = null;
  private imuObservedAt = 0;
  private stopImu: (() => void) | null = null;
  private recovery: RobotRecoveryStatus | null = null;
  private recoveryHeartbeat = false;

  private readonly transport: BrainstemControlTransport;
  private readonly allowed: () => boolean;
  private readonly now: () => number;
  constructor(transport: BrainstemControlTransport, allowed: () => boolean = () => true, now: () => number = elapsedNow) {
    this.transport = transport; this.allowed = allowed; this.now = now;
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  get recoveryStatus() { return this.recovery; }
  private notify() { this.listeners.forEach(listener => listener()); }
  private stopRecoveryHeartbeat() {
    if (this.sessionId && this.recoveryHeartbeat) this.transport.setRecoveryHeartbeat?.(this.sessionId, false);
    this.recoveryHeartbeat = false;
    this.recovery = null;
  }
  private applyRecovery(status: RobotRecoveryStatus) {
    this.recovery = status;
    const selected = status.service === 'ready' && status.sessionSelected;
    if (this.sessionId && selected !== this.recoveryHeartbeat) {
      this.recoveryHeartbeat = selected;
      this.transport.setRecoveryHeartbeat?.(this.sessionId, selected);
    }
    this.notify();
  }
  async refreshRecovery(): Promise<void> {
    if (!this.sessionId || !this.transport.readRecovery || this.retired) return;
    const epoch = this.epoch;
    const id = this.sessionId;
    try {
      const status = await this.transport.readRecovery(id);
      if (!this.valid(epoch) || this.sessionId !== id) return;
      this.applyRecovery(status);
    } catch (error) {
      if (!this.valid(epoch) || this.sessionId !== id) return;
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : '';
      this.applyRecovery(emptyRecoveryStatus(code === 'unimplemented' ? 'missing' : 'unavailable'));
    }
  }
  async recoveryCommand(command: RobotRecoveryCommand): Promise<RobotRecoveryStatus> {
    if (!this.sessionId || !this.transport.recoveryCommand) throw new Error('当前安装包尚未包含摔倒恢复。');
    const id = this.sessionId;
    const status = await this.transport.recoveryCommand(id, command);
    if (this.sessionId === id) this.applyRecovery(status);
    return status;
  }
  private publish(patch: Partial<BrainstemControlState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  private valid(epoch: number) { return !this.retired && this.allowed() && epoch === this.epoch; }
  private fresh() {
    if (!this.state.connected || this.state.observedAt === null) return false;
    const age = this.now() - this.state.observedAt;
    return Number.isFinite(age) && age >= 0 && age < FRESH_MS;
  }
  private releaseImu() {
    this.stopImu?.();
    this.stopImu = null;
    this.imu = null;
    this.imuObservedAt = 0;
  }
  private armImu(sessionId: string) {
    this.releaseImu();
    const listen = this.transport.listenImu;
    if (!listen) return;
    try {
      this.stopImu = listen(sessionId, raw => {
        if (this.retired || this.sessionId !== sessionId) return;
        const sample = projectBrainstemImu(raw);
        if (!sample) return;
        this.imu = sample;
        this.imuObservedAt = this.now();
        this.listeners.forEach(listener => listener());
      });
    } catch { this.stopImu = null; }
  }
  private resetInput(clearClock = true) {
    this.idleTouchLease = false;
    this.commandSpeed = { linearMps: 0, lateralMps: 0, yawRps: 0 };
    this.pendingInput = null;
    this.lastInputSentAt = null;
    this.driveVector = neutral(); this.turnVector = neutral(); this.driveAt = 0; this.turnAt = 0;
    this.inputAt = 0; this.moving = false;
    if (clearClock) {
      if (this.watchdog) clearInterval(this.watchdog);
      this.watchdog = null;
    }
  }
  private currentProfile() {
    const age = this.state.profileObservedAt === null ? Infinity : this.now() - this.state.profileObservedAt;
    return Number.isFinite(age) && age >= 0 && age < PROFILE_FRESH_MS ? this.state.profile : null;
  }
  private recordStopFailure(connection: number) {
    if (this.retired || connection !== this.verifiedConnection) return;
    this.stopUnconfirmed = true;
    this.publish({ error: STOP_UNCONFIRMED_MESSAGE, failureCode: 'stop_unconfirmed', ...(this.state.phase === 'connecting' ? {} : { phase: 'error' as const }) });
  }
  private apply(reply: BrainstemControlReply) {
    if (reply.transport !== undefined && reply.transport !== this.state.transport) throw new Error('Control transport changed');
    if (this.state.transport === 'grpc-lan' && (reply.principalVerified || typeof reply.leaseOwnerMatched !== 'boolean')) throw new Error('Invalid LAN authority');
    if (this.state.transport !== 'grpc-lan' && reply.leaseActive && !reply.principalVerified) throw new Error('Invalid TLS authority');
    if (reply.leaseActive || reply.leaseOwnerMatched) this.authorityTouched = true;
    const loseIntent = !reply.leaseActive && this.state.leaseActive || reply.status.owner === 'yunzhuo'
      || !reply.status.motorOutputEnabled || reply.status.criticalMotorFault
      || !['standing', 'walking'].includes(reply.status.fsmKind);
    // A live lease keeps its safety clock; unsafe status cannot retain a target.
    if (!reply.leaseActive || loseIntent) this.resetInput(!reply.leaseActive);
    this.publish({ connected: true, status: reply.status, leaseActive: reply.leaseActive,
      principalVerified: reply.principalVerified, sequence: reply.sequence ?? this.state.sequence,
      leaseOwnerMatched: reply.leaseOwnerMatched ?? (reply.leaseActive && reply.principalVerified),
      profile: reply.profileUnavailable ? null : reply.profile ?? this.currentProfile(),
      profileObservedAt: reply.profileUnavailable ? null : reply.profile ? this.now() : this.state.profileObservedAt,
      observedAt: this.now(), error: null, failureCode: null,
      manualPrepared: loseIntent ? false : this.state.manualPrepared,
      phase: this.pendingAction ? 'operating' : reply.leaseActive ? 'armed' : 'ready' });
  }
  private async fail(epoch: number, error: unknown) {
    if (!this.valid(epoch)) return;
    const authorityTouched = this.authorityTouched;
    const rawCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      && failureCodes.has(error.code) ? error.code : 'unknown';
    const code = !authorityTouched && (rawCode === 'background' || rawCode === 'cancelled') ? 'unavailable' : rawCode;
    try {
      const age = Math.round(this.now() - this.inputAt);
      console.info(`DOSO_CONTROL_FAILURE code=${code} phase=${this.state.phase} seq=${this.state.sequence} inputAgeMs=${Number.isSafeInteger(age) && age >= 0 ? age : 'unknown'}`);
    } catch { /* Diagnostics cannot prevent authority cleanup. */ }
    if (error && typeof error === 'object' && 'code' in error && error.code === 'stop_unconfirmed') this.stopUnconfirmed = true;
    const id = this.sessionId;
    const connection = this.verifiedConnection;
    this.stopRecoveryHeartbeat();
    this.sessionId = null; this.epoch += 1; this.busy = false; this.pendingAction = null; this.reading = false; this.inputBusy = false; this.acquiring = false;
    this.releaseImu();
    this.resetInput();
    this.settling++;
    this.publish({ ...initial(), phase: 'error', failureCode: this.stopUnconfirmed ? 'stop_unconfirmed' : code,
      error: this.stopUnconfirmed ? STOP_UNCONFIRMED_MESSAGE : failureMessage(error) });
    try {
      if (id) {
        if (authorityTouched && !(error && typeof error === 'object' && 'code' in error && error.code === 'stop_unconfirmed')) {
          await this.transport.interrupt(id).catch(() => this.recordStopFailure(connection));
        }
        await this.transport.close(id).catch(() => undefined);
      }
    } finally { this.settling--; }
  }

  get canReconnectAfterFailure(): boolean { return !this.retired && this.allowed() && !this.busy && !this.settling && !this.stopUnconfirmed; }

  async connect(endpoint: BrainstemGrpcEndpoint, principal: string, automatic = false): Promise<boolean> {
    if (this.retired || !this.allowed() || this.busy || automatic && !this.canReconnectAfterFailure) return false;
    const previousId = this.sessionId;
    const previousConnection = this.verifiedConnection;
    this.stopRecoveryHeartbeat();
    this.releaseImu();
    const previousAuthorityTouched = this.authorityTouched;
    this.sessionId = null; this.resetInput();
    const epoch = ++this.epoch;
    this.busy = true; this.publish({ ...initial(), phase: 'connecting', error: this.stopUnconfirmed ? STOP_UNCONFIRMED_MESSAGE : null });
    try {
      if (previousId) {
        if (previousAuthorityTouched) await this.transport.interrupt(previousId).catch(() => this.recordStopFailure(previousConnection));
        await this.transport.close(previousId).catch(() => undefined);
      }
      if (!this.valid(epoch)) return false;
      const reply = await this.transport.open(endpoint, principal);
      if (!this.valid(epoch)) { await this.transport.close(reply.sessionId).catch(() => undefined); return false; }
      // A status read proves transport, not actuator authorization or a lease.
      const lanDev = endpoint.transport === 'lan-dev';
      if ((lanDev ? reply.transport !== 'grpc-lan' || reply.mutualTlsVerified !== false || reply.clientIdentitySelected !== false
        : reply.transport !== 'grpc-mtls' || reply.mutualTlsVerified !== true) || reply.leaseActive || reply.principalVerified || reply.leaseOwnerMatched) {
        await this.transport.close(reply.sessionId).catch(() => undefined); throw new Error('Invalid open');
      }
      this.sessionId = reply.sessionId; this.verifiedConnection++; this.stopUnconfirmed = false; this.authorityTouched = false; this.busy = false;
      this.armImu(reply.sessionId);
      this.publish({ transport: reply.transport, mutualTlsVerified: reply.mutualTlsVerified, clientIdentitySelected: !lanDev }); this.apply(reply); return true;
    } catch (error) { await this.fail(epoch, error); return false; }
  }

  async refresh(): Promise<void> {
    if (this.state.profile && !this.currentProfile()) this.publish({ profile: null, profileObservedAt: null });
    // Existing polls must expire visible telemetry even while a native request is still pending.
    if (!this.retired && this.state.observedAt !== null && !this.fresh()) {
      this.publish({ status: null, profile: null, observedAt: null, manualPrepared: false });
    }
    // WalkChecked ACKs already carry status; polling this serial channel can starve live input.
    if (!this.sessionId || !this.allowed() || this.retired || this.busy || this.reading || this.inputBusy || this.moving) return;
    const epoch = this.epoch; const id = this.sessionId; this.reading = true;
    let finishRead: () => void = () => {};
    const done = new Promise<void>(resolve => { finishRead = resolve; });
    this.readDone = done;
    try { const reply = await this.transport.read(id); if (this.valid(epoch)) { this.reading = false; this.apply(reply); } }
    catch (error) { await this.fail(epoch, error); }
    finally {
      if (this.valid(epoch)) this.reading = false;
      if (this.readDone === done) this.readDone = null;
      finishRead();
    }
  }

  get canAcquire(): boolean {
    const s = this.state.status;
    return !this.retired && this.allowed() && this.fresh() && !this.busy && !this.state.leaseActive
      && !!this.currentProfile() && this.currentProfile()?.activeModeId !== 'recovery'
      && !!s && !s.grpcLeaseActive && s.owner !== 'yunzhuo' && s.motorOutputEnabled && !s.criticalMotorFault
      && (s.fsmKind === 'standing' || s.fsmKind === 'walking');
  }
  get canUseManualControl(): boolean {
    const s = this.state.status;
    return !this.retired && this.allowed() && this.fresh() && !this.busy && this.state.leaseActive
      && this.state.profile?.activeModeId !== 'recovery'
      && this.state.leaseOwnerMatched && (this.state.transport === 'grpc-lan' || this.state.principalVerified) && !!s && s.grpcLeaseActive && s.owner === 'grpc'
      && s.motorOutputEnabled && !s.criticalMotorFault && s.readyForWalk;
  }
  get canBeginManualControl(): boolean {
    return this.canUseManualControl || this.state.manualPrepared && this.fresh() && this.allowed() && !this.retired
      && (this.canAcquire || this.acquiring);
  }
  get canBeginTouchControl(): boolean { return this.canAcquire || this.canBeginManualControl; }
  get touchBlockedReason(): string | null {
    if (this.canBeginTouchControl) return null;
    const s = this.state.status;
    if (this.state.error) return this.state.error;
    if (!this.fresh() || !s) return '等待机器人状态';
    if (s.criticalMotorFault) return '请检查电机故障';
    if (!s.motorOutputEnabled) return '请先使能电机';
    if (s.fsmKind === 'grounded' || s.fsmKind === 'zero') return '请先站立';
    if (s.fsmKind === 'transitioning') return '姿态切换中';
    if (s.owner === 'yunzhuo' || s.grpcLeaseActive && !this.state.leaseActive) return '控制权被占用';
    if (!this.currentProfile()) return '等待策略同步';
    if (this.currentProfile()?.activeModeId === 'recovery') return '当前为恢复模式';
    return '等待控制就绪';
  }
  endTouchGesture(): Promise<void> {
    // Normal release sends zero; cancellation and uncertain in-flight movement still revoke authority.
    this.idleTouchLease = this.state.leaseActive;
    this.idleZeroAt = this.now();
    return this.state.leaseActive ? this.sticks(neutral(), neutral()) : this.interrupt();
  }
  prepareManualControl(): boolean {
    if (!this.canAcquire) return false;
    this.publish({ manualPrepared: true, error: null });
    return true;
  }

  get operationReadiness(): Partial<Record<ControlOperation, ControlActionReadiness>> {
    return this.readiness();
  }
  private readiness(ownedAction?: object): Partial<Record<ControlOperation, ControlActionReadiness>> {
    const status = this.state.status;
    const base = !this.retired && this.allowed() && this.fresh()
      && (!this.busy || ownedAction !== undefined && this.pendingAction === ownedAction) && !!status;
    const safe = base && !!this.currentProfile() && this.currentProfile()?.activeModeId !== 'recovery' && status.owner !== 'yunzhuo' && !status.criticalMotorFault && status.fsmKind !== 'transitioning';
    const result = (ready: boolean, reason: string): ControlActionReadiness => ({ ready, ...(ready ? {} : { blockedReason: reason }) });
    return {
      stop: result(this.state.connected && this.state.leaseActive, '尚未取得控制权'),
      enableMotor: result(!!safe && !status?.motorOutputEnabled, '请先连接机器狗并确认电机状态'),
      disableMotor: result(!!base && status?.motorOutputEnabled === true, '请先连接机器狗并确认电机状态'),
      stand: result(!!safe && !!status?.motorOutputEnabled && (status.fsmKind === 'grounded' || status.fsmKind === 'zero'
        || status.fsmKind === 'walking' && !status.grpcLeaseActive && !this.state.leaseActive), '电机须已使能，行走后请先停止并释放控制；站立或切换中不可起立'),
      sit: result(!!safe && !!status?.motorOutputEnabled && (status.fsmKind === 'standing' || status.fsmKind === 'walking'), '电机须已使能，且机器狗当前已站立'),
      switchPolicy: result(!!safe && (status?.fsmKind === 'grounded' || status?.fsmKind === 'standing') && !status.grpcLeaseActive && !!this.currentProfile() && profileOptions(this.currentProfile()!).length > 0, '请先站稳或趴地、释放控制并同步策略目录；行走中不可切换'),
      setZero: result(!!base && status?.owner !== 'yunzhuo' && status?.fsmKind === 'grounded' && !status.grpcLeaseActive, '请先趴地并释放控制'),
      clearMotorFault: result(!!base && status?.owner !== 'yunzhuo' && status?.fsmKind !== 'transitioning', '请先连接机器狗'),
      playGesture: result(!!safe && status?.motorOutputEnabled === true && status.fsmKind === 'standing' && !status.grpcLeaseActive, '请先站立'),
    };
  }

  async listGestures(): Promise<readonly BrainstemGesture[]> {
    const id = this.sessionId;
    if (!id || typeof this.transport.listGestures !== 'function') return [];
    return this.transport.listGestures(id);
  }

  async action(action: BrainstemControlAction, profileId?: string): Promise<void> {
    // Bind the intent before yielding: an old read must not retarget this action after reconnect.
    const epoch = this.epoch; const id = this.sessionId;
    if (!id || !this.valid(epoch) || this.sessionId !== id) throw new Error('控制连接已变化，请重新操作。');
    if (this.busy || this.pendingAction) throw new Error('上一项操作尚未结束，请等待设备响应。');
    const names = { enable: 'enableMotor', disable: 'disableMotor', 'stand-up': 'stand', 'sit-down': 'sit', 'switch-profile': 'switchPolicy',
      'set-zero': 'setZero', 'clear-motor-fault': 'clearMotorFault', 'play-gesture': 'playGesture' } as const;
    const profileAllowed = () => action === 'play-gesture' ? !!profileId && profileId.length <= 64
      : action !== 'switch-profile' || !!profileId && !!this.currentProfile()
      && profileOptions(this.currentProfile()!).some(option => option.id === profileId);
    const request = {};
    this.pendingAction = request;
    this.busy = true; this.resetInput();
    this.publish({ phase: 'operating', manualPrepared: false });
    let dispatched = false;
    try {
      if (this.readDone) await this.readDone;
      if (!this.valid(epoch) || this.sessionId !== id || this.pendingAction !== request) throw new Error('控制连接已变化，请重新操作。');
      if (this.readiness(request)[names[action]]?.ready !== true) throw new Error('机器狗当前状态不允许此操作。');
      if (!profileAllowed()) throw new Error('所选策略已不可用，请刷新状态。');
      const slotRequest = action === 'switch-profile' && this.state.profile?.modeCapabilities?.some(mode => mode.kind === 'locomotion');
      // Native action sends zero/release before posture, power or profile changes.
      this.publish({ phase: 'operating', leaseActive: false, manualPrepared: false });
      if (!this.valid(epoch) || this.sessionId !== id || this.pendingAction !== request) throw new Error('控制连接已变化，请重新操作。');
      if (this.readiness(request)[names[action]]?.ready !== true) throw new Error('机器狗当前状态不允许此操作。');
      if (!profileAllowed()) throw new Error('所选策略已不可用，请刷新状态。');
      dispatched = true;
      this.authorityTouched = true;
      const reply = await this.transport.action(id, action, profileId);
      if (!this.valid(epoch) || this.pendingAction !== request) throw new Error('控制连接已变化，请重新操作。');
      if (slotRequest && reply.profile?.activeModeId !== profileId) throw new Error('策略切换结果未确认，请刷新机器狗状态。');
      this.pendingAction = null; this.busy = false; this.apply(reply);
    } catch (error) {
      if (dispatched) {
        let failure = error;
        const rejected = error && typeof error === 'object' && 'code' in error
          && (error.code === 'precondition' || error.code === 'unimplemented');
        const ownsAction = () => this.valid(epoch) && this.sessionId === id && this.pendingAction === request;
        if (rejected && ownsAction()) {
          try {
            // A business rejection keeps the channel only after native authority is retired and state is re-read.
            const stopped = await this.transport.interrupt(id);
            if (ownsAction()) {
              if (stopped?.leaseActive || stopped?.leaseOwnerMatched) throw { code: 'stop_unconfirmed' };
              const reply = await this.transport.read(id);
              if (ownsAction()) {
                if (reply.leaseActive || reply.leaseOwnerMatched) throw { code: 'stop_unconfirmed' };
                this.apply(reply);
                if (ownsAction()) {
                  this.authorityTouched = false;
                  this.pendingAction = null; this.busy = false;
                  this.publish({ phase: 'ready', manualPrepared: false, sequence: 0, failureCode: null, error: failureMessage(error),
                    ...(action === 'switch-profile' && !reply.profile ? { profile: null, profileObservedAt: null } : {}) });
                }
              }
            }
          } catch (recoveryError) { failure = recoveryError; await this.fail(epoch, recoveryError); }
        } else await this.fail(epoch, error);
        const code = failure && typeof failure === 'object' && 'code' in failure
          && typeof failure.code === 'string' && failureCodes.has(failure.code) ? failure.code : 'unknown';
        throw Object.assign(new Error(failureMessage(failure)), { code });
      }
      throw error;
    } finally {
      if (this.pendingAction === request) {
        this.pendingAction = null;
        if (this.valid(epoch)) { this.busy = false; this.publish({ phase: this.state.leaseActive ? 'armed' : 'ready' }); }
      }
    }
  }

  async acquire(): Promise<void> {
    if (this.busy) return;
    const epoch = this.epoch; const id = this.sessionId;
    if (this.readDone) await this.readDone;
    if (!id || !this.valid(epoch) || this.sessionId !== id || !this.canAcquire) return;
    this.busy = true; this.acquiring = true;
    this.publish({ phase: 'operating' });
    try {
      if (!this.valid(epoch) || this.sessionId !== id) return;
      this.authorityTouched = true;
      const reply = await this.transport.acquire(id);
      if (!this.valid(epoch)) return;
      if (!reply.leaseActive || !(reply.leaseOwnerMatched ?? reply.principalVerified) || this.state.transport !== 'grpc-lan' && !reply.principalVerified || !Number.isSafeInteger(reply.sequence) || (reply.sequence ?? 0) <= 0) throw new Error('Missing zero ACK');
      this.busy = false; this.acquiring = false; this.apply(reply);
      this.watchdog = setInterval(() => {
        const at = this.now();
        const ages = [at - this.inputAt, ...(nonzero(this.driveVector) ? [at - this.driveAt] : []),
          ...(this.turnVector.x !== 0 ? [at - this.turnAt] : [])];
        if (!this.allowed() || this.moving && (!this.canUseManualControl
          || ages.some(age => !Number.isFinite(age) || age < 0 || age > INPUT_FRESH_MS))) {
          void this.interrupt().catch(() => undefined); // Failure is published; automatic cleanup has no awaiting UI caller.
        } else if (this.moving || this.pendingInput) {
          void this.flushInput().catch(() => undefined);
        } else if (this.idleTouchLease && this.canUseManualControl && at - this.idleZeroAt >= IDLE_ZERO_PERIOD_MS) {
          // Only fresh zero commands keep an idle touch lease alive; never replay a released target.
          this.idleZeroAt = at;
          void this.sticks(neutral(), neutral()).catch(() => undefined);
        }
      }, INPUT_PERIOD_MS);
    } catch (error) { await this.fail(epoch, error); }
  }

  drive(vector: ControlVector) { return this.sample('drive', vector); }
  turn(vector: ControlVector) { return this.sample('turn', vector); }
  sticks(drive: ControlVector, turn: ControlVector, sampledAtMonotonicMs?: number) { return this.sample('both', drive, turn, sampledAtMonotonicMs); }
  private async sample(side: 'drive' | 'turn' | 'both', vector: ControlVector, turn?: ControlVector, sampledAtMonotonicMs?: number): Promise<void> {
    const coordinates = [vector.x, vector.y, ...(side === 'both' ? [turn?.x, turn?.y] : [])];
    if (!coordinates.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1)) { await this.interrupt(); return; }
    if (sampledAtMonotonicMs !== undefined && (!Number.isSafeInteger(sampledAtMonotonicMs) || sampledAtMonotonicMs < 0)) { await this.interrupt(); return; }
    if (this.state.manualPrepared && !this.state.leaseActive && this.canAcquire
      && (nonzero(vector) || side === 'both' && !!turn && nonzero(turn))) {
      // Acquire only after explicit intent and a live gesture. Discard this sample:
      // the next live sample must drive, never the vector captured before the ACK.
      await this.acquire(); return;
    }
    if (!this.sessionId || !this.canUseManualControl) return;
    const at = this.now();
    const wasMoving = this.moving;
    if (side === 'both') { this.driveVector = { ...vector }; this.turnVector = { ...turn! }; this.driveAt = at; this.turnAt = at; }
    else if (side === 'drive') { this.driveVector = { ...vector }; this.driveAt = at; }
    else { this.turnVector = { ...vector }; this.turnAt = at; }
    // Never retain motion from an inactive/stale second touch channel.
    const driveAge = at - this.driveAt, turnAge = at - this.turnAt;
    if (!Number.isFinite(at) || nonzero(this.driveVector) && (driveAge < 0 || driveAge > INPUT_FRESH_MS)
      || this.turnVector.x !== 0 && (turnAge < 0 || turnAge > INPUT_FRESH_MS)) { await this.interrupt(); return; }
    this.inputAt = at;
    this.moving = nonzero(this.driveVector) || this.turnVector.x !== 0;
    if (this.moving) this.idleTouchLease = false;
    if (wasMoving && !this.moving && (this.inputBusy || this.reading)) { this.pendingInput = null; await this.interrupt(); return; }
    if (wasMoving && !this.moving) this.lastInputSentAt = null;
    // Keep only the latest target; the in-flight snapshot still requires its own ACK.
    this.pendingInput = { id: this.sessionId, epoch: this.epoch, drive: { ...this.driveVector }, turn: { ...this.turnVector },
      driveAt: this.driveAt, turnAt: this.turnAt, observedAt: at, sampledAtMonotonicMs };
    // First touch and neutral are immediate; subsequent motion belongs to the 20ms clock.
    if (this.lastInputSentAt === null || !this.moving) await this.flushInput();
  }

  private async flushInput(): Promise<void> {
    if (!this.inputBusy && !this.reading && !this.busy && !this.pendingAction) {
      const input = this.pendingInput;
      if (!input || !this.valid(input.epoch) || this.sessionId !== input.id || !this.canUseManualControl) return;
      const at = this.now();
      const ages = [at - input.observedAt, ...(nonzero(input.drive) ? [at - input.driveAt] : []),
        ...(input.turn.x !== 0 ? [at - input.turnAt] : [])];
      if (!Number.isFinite(at) || ages.some(age => !Number.isFinite(age) || age < 0 || age > INPUT_FRESH_MS)) {
        await this.interrupt(); return;
      }
      if (this.lastInputSentAt !== null && at - this.lastInputSentAt < INPUT_PERIOD_MS) return;
      const { id, epoch } = input;
      this.inputBusy = true;
      this.lastInputSentAt = at;
      const previousSequence = this.state.sequence;
      try {
        // Operator/screen +X points right; Brainstem body +Y is left and +Z is CCW.
        // Both deployed operator profiles map full stick travel to 1 m/s and 1 rad/s.
        const forward = -input.drive.y;
        const lateral = -input.drive.x;
        const yawRate = -input.turn.x;
        this.authorityTouched = true;
        const reply = await this.transport.input(id, forward === 0 ? 0 : forward, lateral === 0 ? 0 : lateral,
          yawRate === 0 ? 0 : yawRate, input.sampledAtMonotonicMs);
        if (!this.valid(epoch)) return;
        if (!reply.leaseActive || !(reply.leaseOwnerMatched ?? reply.principalVerified) || this.state.transport !== 'grpc-lan' && !reply.principalVerified || reply.sequence !== previousSequence + 1) throw { code: 'ack_mismatch' };
        this.commandSpeed = { linearMps: forward === 0 ? 0 : forward, lateralMps: lateral === 0 ? 0 : lateral, yawRps: yawRate === 0 ? 0 : yawRate };
        this.apply(reply);
        if (this.pendingInput === input && !this.moving) {
          this.pendingInput = null; this.lastInputSentAt = null;
        }
      } catch (error) {
        // Input busy is a bridge rejection before dispatch; retain only the latest target until its original expiry.
        if (error && typeof error === 'object' && 'code' in error && error.code === 'timeout' && this.valid(epoch)) {
          // A confirmed release retires this gesture without discarding the status connection.
          // interrupt fails closed itself if the robot cannot confirm stopping.
          await this.interrupt();
          if (this.sessionId === id && this.state.connected) {
            this.publish({ error: '运动回执超时，已释放控制。请松手后重试。', failureCode: 'timeout' });
          }
        } else if (!(error && typeof error === 'object' && 'code' in error && error.code === 'busy')) await this.fail(epoch, error);
      }
      finally { if (this.valid(epoch)) this.inputBusy = false; }
    }
  }

  interrupt(): Promise<void> {
    const pending = this.interrupting;
    if (pending && pending.id === this.sessionId && pending.epoch === this.epoch) return pending.promise;
    const promise = this.performInterrupt();
    const request = { id: this.sessionId, epoch: this.epoch, promise };
    this.interrupting = request;
    const clear = () => { if (this.interrupting === request) this.interrupting = null; };
    void promise.then(clear, clear);
    return promise;
  }

  private async performInterrupt(): Promise<void> {
    const id = this.sessionId;
    if (this.retired) return;
    if (!id) {
      if (this.state.error) throw new Error(this.state.error);
      return;
    }
    const nativeMayHoldLease = this.state.leaseActive || this.acquiring || this.inputBusy || this.moving || this.pendingAction !== null;
    if (!nativeMayHoldLease && !this.state.manualPrepared) return;
    // Rotate before cancellation so a late Acquire/ACK can never re-arm UI.
    const epoch = ++this.epoch; this.busy = true; this.pendingAction = null; this.reading = false; this.inputBusy = false;
    this.resetInput(); this.acquiring = false; this.publish({ leaseActive: false, manualPrepared: false, phase: 'operating' });
    if (!nativeMayHoldLease) { this.busy = false; this.publish({ phase: 'ready' }); return; }
    try { const reply = await this.transport.interrupt(id); if (this.valid(epoch)) {
      if (reply?.leaseActive || reply?.leaseOwnerMatched) throw { code: 'stop_unconfirmed' };
      this.authorityTouched = false;
      this.busy = false;
      if (reply) this.apply({ ...reply, leaseActive: false });
      else this.publish({ phase: 'ready', status: null, observedAt: null });
    } }
    catch (error) { await this.fail(epoch, error); throw new Error(failureMessage(error)); }
  }

  async disconnect(): Promise<void> {
    const id = this.sessionId; const connection = this.verifiedConnection;
    this.stopRecoveryHeartbeat();
    this.sessionId = null; this.epoch++;
    this.releaseImu();
    const authorityTouched = this.authorityTouched;
    this.busy = false; this.pendingAction = null; this.reading = false; this.inputBusy = false; this.acquiring = false; this.resetInput();
    this.settling++;
    this.publish({ ...initial(), ...(this.stopUnconfirmed ? { phase: 'error' as const, failureCode: 'stop_unconfirmed', error: STOP_UNCONFIRMED_MESSAGE } : {}) });
    try {
      if (id) {
        // Native lifecycle already retires untouched status channels; only mutations need a stop receipt.
        if (authorityTouched) await this.transport.interrupt(id).catch(() => this.recordStopFailure(connection));
        await this.transport.close(id).catch(() => undefined);
      }
    } finally { this.settling--; }
  }
  dispose() { this.retired = true; this.listeners.clear(); void this.disconnect(); }

  get runtimeState(): ControlRuntimeState {
    const s = this.fresh() ? this.state.status : null;
    const profile = s ? this.currentProfile() : null;
    const terrain = profile ? terrainModeFromProfile(profile) : null;
    // An in-flight native action can outlast telemetry freshness without losing its channel.
    const awaitingAction = this.state.connected && this.pendingAction !== null;
    const controlOwner = !s ? 'unknown' : s.owner === 'yunzhuo' && !s.grpcLeaseActive ? 'robot-remote'
      : s.owner === 'none' && !s.grpcLeaseActive && !this.state.leaseActive ? 'none'
      : s.owner === 'grpc' && s.grpcLeaseActive
        ? this.state.leaseActive ? this.state.leaseOwnerMatched ? 'this-device' : 'unknown' : 'remote'
        : 'unknown';
    return { controlLink: s || awaitingAction ? 'connected' : 'disconnected', controlAuthority: this.canUseManualControl ? 'held' : 'not-held', controlOwner,
      // A private CA/client principal is separate from cloud ownership/binding.
      deviceIdentity: 'unbound', motorState: s ? s.motorOutputEnabled ? 'enabled' : 'disabled' : 'unknown',
      // Walking is not confirmation that a fixed-pose StandUp has completed.
      posture: s?.fsmKind === 'standing' ? 'standing' : s?.fsmKind === 'grounded' ? 'sitting' : 'unknown',
      faultStatus: s ? s.criticalMotorFault ? 'active' : 'clear' : 'unknown',
      ...(this.imu && this.now() - this.imuObservedAt >= 0 && this.now() - this.imuObservedAt < 1000 ? { imu: this.imu } : {}),
      currentPolicy: profile ? currentPolicyFromProfile(profile) : null,
      policyCatalogStatus: profile ? 'synced' : 'unknown', policyOptions: profile ? profileOptions(profile) : [],
      recoveryMode: recoveryModeFromProfile(profile),
      ...(terrain ? { terrainMode: { ...terrain, catalogStatus: 'synced' as const, source: 'device' as const } } : {}),
      speed: s && (s.owner === 'none' && !s.grpcLeaseActive || this.canUseManualControl)
        ? { ...this.commandSpeed, source: 'command' }
        : { linearMps: null, lateralMps: null, yawRps: null, source: 'unknown' }, inputSource: 'touch' };
  }
}
