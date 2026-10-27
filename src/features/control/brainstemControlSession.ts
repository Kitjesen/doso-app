import type { BrainstemControlAction, BrainstemControlReply, BrainstemControlTransport } from '../../services/brainstemControl';
import type { BrainstemGrpcEndpoint, BrainstemGrpcProfile, BrainstemGrpcStatus } from '../../services/brainstemGrpc';
import type { ControlActionReadiness, ControlOperation, ControlRuntimeState } from './controlOperations';
// @ts-expect-error Node 24 type stripping requires explicit TypeScript extensions.
import { profileOptions, terrainModeFromProfile } from '../../services/directRobotConnection.ts';

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
  error: string | null;
  sequence: number;
  observedAt: number | null;
}>;
export type ControlVector = Readonly<{ x: number; y: number }>;
const initial = (): BrainstemControlState => ({ phase: 'disconnected', connected: false, leaseActive: false, manualPrepared: false,
  principalVerified: false, leaseOwnerMatched: false, transport: null, clientIdentitySelected: false, mutualTlsVerified: false, status: null, profile: null, error: null, sequence: 0, observedAt: null });
const FRESH_MS = 1500;
const INPUT_FRESH_MS = 150;
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
  : '控制连接已中断，请重新连接并申请控制权。';

/** Owns one foreground connection. No credentials, lease tokens, retry or input replay in JS. */
export class BrainstemControlSession {
  state: BrainstemControlState = initial();
  private listeners = new Set<() => void>();
  private epoch = 0;
  private sessionId: string | null = null;
  private retired = false;
  private stopUnconfirmed = false;
  private verifiedConnection = 0;
  private busy = false;
  private pendingAction: object | null = null;
  private reading = false;
  private readDone: Promise<void> | null = null;
  private interrupting: { id: string | null; epoch: number; promise: Promise<void> } | null = null;
  private inputBusy = false;
  private acquiring = false;
  private driveVector = neutral();
  private turnVector = neutral();
  private driveAt = 0;
  private turnAt = 0;
  private inputAt = 0;
  private moving = false;
  private watchdog: ReturnType<typeof setInterval> | null = null;

  private readonly transport: BrainstemControlTransport;
  private readonly allowed: () => boolean;
  private readonly now: () => number;
  constructor(transport: BrainstemControlTransport, allowed: () => boolean = () => true, now: () => number = elapsedNow) {
    this.transport = transport; this.allowed = allowed; this.now = now;
  }

  subscribe(listener: () => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
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
  private resetInput() {
    this.driveVector = neutral(); this.turnVector = neutral(); this.driveAt = 0; this.turnAt = 0;
    this.inputAt = 0; this.moving = false;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }
  private recordStopFailure(connection: number) {
    if (this.retired || connection !== this.verifiedConnection) return;
    this.stopUnconfirmed = true;
    this.publish({ error: STOP_UNCONFIRMED_MESSAGE, ...(this.state.phase === 'connecting' ? {} : { phase: 'error' as const }) });
  }
  private apply(reply: BrainstemControlReply) {
    if (reply.transport !== undefined && reply.transport !== this.state.transport) throw new Error('Control transport changed');
    if (this.state.transport === 'grpc-lan' && (reply.principalVerified || typeof reply.leaseOwnerMatched !== 'boolean')) throw new Error('Invalid LAN authority');
    if (this.state.transport !== 'grpc-lan' && reply.leaseActive && !reply.principalVerified) throw new Error('Invalid TLS authority');
    const loseIntent = !reply.leaseActive && this.state.leaseActive || reply.status.owner === 'yunzhuo'
      || !reply.status.motorOutputEnabled || reply.status.criticalMotorFault
      || !['standing', 'walking'].includes(reply.status.fsmKind);
    if (!reply.leaseActive) this.resetInput();
    this.publish({ connected: true, status: reply.status, leaseActive: reply.leaseActive,
      principalVerified: reply.principalVerified, sequence: reply.sequence ?? this.state.sequence,
      leaseOwnerMatched: reply.leaseOwnerMatched ?? (reply.leaseActive && reply.principalVerified),
      profile: reply.profile ?? this.state.profile, observedAt: this.now(), error: null,
      manualPrepared: loseIntent ? false : this.state.manualPrepared,
      phase: this.pendingAction ? 'operating' : reply.leaseActive ? 'armed' : 'ready' });
  }
  private async fail(epoch: number, error: unknown) {
    if (!this.valid(epoch)) return;
    if (error && typeof error === 'object' && 'code' in error && error.code === 'stop_unconfirmed') this.stopUnconfirmed = true;
    const id = this.sessionId;
    const connection = this.verifiedConnection;
    this.sessionId = null; this.epoch += 1; this.busy = false; this.pendingAction = null; this.reading = false; this.inputBusy = false; this.acquiring = false;
    this.resetInput();
    this.publish({ ...initial(), phase: 'error', error: this.stopUnconfirmed ? STOP_UNCONFIRMED_MESSAGE : failureMessage(error) });
    if (id) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'stop_unconfirmed')) {
        await this.transport.interrupt(id).catch(() => this.recordStopFailure(connection));
      }
      await this.transport.close(id).catch(() => undefined);
    }
  }

  async connect(endpoint: BrainstemGrpcEndpoint, principal: string): Promise<boolean> {
    if (this.retired || !this.allowed() || this.busy) return false;
    const previousId = this.sessionId;
    const previousConnection = this.verifiedConnection;
    this.sessionId = null; this.resetInput();
    const epoch = ++this.epoch;
    this.busy = true; this.publish({ ...initial(), phase: 'connecting', error: this.stopUnconfirmed ? STOP_UNCONFIRMED_MESSAGE : null });
    try {
      if (previousId) { await this.transport.interrupt(previousId).catch(() => this.recordStopFailure(previousConnection)); await this.transport.close(previousId).catch(() => undefined); }
      if (!this.valid(epoch)) return false;
      const reply = await this.transport.open(endpoint, principal);
      if (!this.valid(epoch)) { await this.transport.close(reply.sessionId).catch(() => undefined); return false; }
      // A status read proves transport, not actuator authorization or a lease.
      const lanDev = endpoint.transport === 'lan-dev';
      if ((lanDev ? reply.transport !== 'grpc-lan' || reply.mutualTlsVerified !== false || reply.clientIdentitySelected !== false
        : reply.transport !== 'grpc-mtls' || reply.mutualTlsVerified !== true) || reply.leaseActive || reply.principalVerified || reply.leaseOwnerMatched) {
        await this.transport.close(reply.sessionId).catch(() => undefined); throw new Error('Invalid open');
      }
      this.sessionId = reply.sessionId; this.verifiedConnection++; this.stopUnconfirmed = false; this.busy = false;
      this.publish({ transport: reply.transport, mutualTlsVerified: reply.mutualTlsVerified, clientIdentitySelected: !lanDev }); this.apply(reply); return true;
    } catch (error) { await this.fail(epoch, error); return false; }
  }

  async refresh(): Promise<void> {
    if (!this.sessionId || !this.allowed() || this.retired || this.busy || this.reading || this.inputBusy) return;
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
      && !!s && !s.grpcLeaseActive && s.owner !== 'yunzhuo' && s.motorOutputEnabled && !s.criticalMotorFault
      && (s.fsmKind === 'standing' || s.fsmKind === 'walking');
  }
  get canUseManualControl(): boolean {
    const s = this.state.status;
    return !this.retired && this.allowed() && this.fresh() && !this.busy && this.state.leaseActive
      && this.state.leaseOwnerMatched && (this.state.transport === 'grpc-lan' || this.state.principalVerified) && !!s && s.grpcLeaseActive && s.owner === 'grpc'
      && s.motorOutputEnabled && !s.criticalMotorFault && s.readyForWalk;
  }
  get canBeginManualControl(): boolean {
    return this.canUseManualControl || this.state.manualPrepared && this.fresh() && this.allowed() && !this.retired
      && (this.canAcquire || this.acquiring);
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
    const safe = base && status.owner !== 'yunzhuo' && !status.criticalMotorFault && status.fsmKind !== 'transitioning';
    const result = (ready: boolean, reason: string): ControlActionReadiness => ({ ready, ...(ready ? {} : { blockedReason: reason }) });
    return {
      stop: result(this.state.connected && this.state.leaseActive, '尚未取得控制权'),
      enableMotor: result(!!safe && !status?.motorOutputEnabled, '请先连接机器狗并确认电机状态'),
      disableMotor: result(!!base && status?.motorOutputEnabled === true, '请先连接机器狗并确认电机状态'),
      stand: result(!!safe && !!status?.motorOutputEnabled && (status.fsmKind === 'grounded' || status.fsmKind === 'zero'
        || status.fsmKind === 'walking' && !status.grpcLeaseActive && !this.state.leaseActive), '电机须已使能，行走后请先停止并释放控制；站立或切换中不可起立'),
      sit: result(!!safe && !!status?.motorOutputEnabled && (status.fsmKind === 'standing' || status.fsmKind === 'walking'), '电机须已使能，且机器狗当前已站立'),
      switchPolicy: result(!!safe && (status?.fsmKind === 'grounded' || status?.fsmKind === 'standing') && !status.grpcLeaseActive && !!this.state.profile?.available.length, '请先站稳或趴地、释放控制并同步策略目录；行走中不可切换'),
    };
  }

  async action(action: BrainstemControlAction, profileId?: string): Promise<void> {
    // Bind the intent before yielding: an old read must not retarget this action after reconnect.
    const epoch = this.epoch; const id = this.sessionId;
    if (!id || !this.valid(epoch) || this.sessionId !== id) throw new Error('控制连接已变化，请重新操作。');
    if (this.busy || this.pendingAction) throw new Error('上一项操作尚未结束，请等待设备响应。');
    const names = { enable: 'enableMotor', disable: 'disableMotor', 'stand-up': 'stand', 'sit-down': 'sit', 'switch-profile': 'switchPolicy' } as const;
    const request = {};
    this.pendingAction = request;
    this.busy = true; this.resetInput();
    this.publish({ phase: 'operating', manualPrepared: false });
    let dispatched = false;
    try {
      if (this.readDone) await this.readDone;
      if (!this.valid(epoch) || this.sessionId !== id || this.pendingAction !== request) throw new Error('控制连接已变化，请重新操作。');
      if (this.readiness(request)[names[action]]?.ready !== true) throw new Error('机器狗当前状态不允许此操作。');
      if (action === 'switch-profile' && (!profileId || !this.state.profile?.available.includes(profileId))) throw new Error('所选策略已不可用，请刷新状态。');
      // Native action sends zero/release before posture, power or profile changes.
      this.publish({ phase: 'operating', leaseActive: false, manualPrepared: false });
      if (!this.valid(epoch) || this.sessionId !== id || this.pendingAction !== request) throw new Error('控制连接已变化，请重新操作。');
      if (this.readiness(request)[names[action]]?.ready !== true) throw new Error('机器狗当前状态不允许此操作。');
      dispatched = true;
      const reply = await this.transport.action(id, action, profileId);
      if (!this.valid(epoch) || this.pendingAction !== request) throw new Error('控制连接已变化，请重新操作。');
      this.pendingAction = null; this.busy = false; this.apply(reply);
    } catch (error) {
      if (dispatched) { await this.fail(epoch, error); throw new Error(failureMessage(error)); }
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
      const reply = await this.transport.acquire(id);
      if (!this.valid(epoch)) return;
      if (!reply.leaseActive || !(reply.leaseOwnerMatched ?? reply.principalVerified) || this.state.transport !== 'grpc-lan' && !reply.principalVerified || !Number.isSafeInteger(reply.sequence) || (reply.sequence ?? 0) <= 0) throw new Error('Missing zero ACK');
      this.busy = false; this.acquiring = false; this.apply(reply);
      this.watchdog = setInterval(() => {
        const age = this.now() - this.inputAt;
        if (!this.allowed() || this.moving && (!Number.isFinite(age) || age < 0 || age > INPUT_FRESH_MS)) {
          void this.interrupt().catch(() => undefined); // Failure is published; automatic cleanup has no awaiting UI caller.
        }
      }, 25);
    } catch (error) { await this.fail(epoch, error); }
  }

  drive(vector: ControlVector) { return this.sample('drive', vector); }
  turn(vector: ControlVector) { return this.sample('turn', vector); }
  sticks(drive: ControlVector, turn: ControlVector, sampledAtMonotonicMs?: number) { return this.sample('both', drive, turn, sampledAtMonotonicMs); }
  private async sample(side: 'drive' | 'turn' | 'both', vector: ControlVector, turn?: ControlVector, sampledAtMonotonicMs?: number): Promise<void> {
    const coordinates = [vector.x, vector.y, ...(side === 'both' ? [turn?.x, turn?.y] : [])];
    if (!coordinates.every(v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1)) { await this.interrupt(); return; }
    if (sampledAtMonotonicMs !== undefined && (!Number.isSafeInteger(sampledAtMonotonicMs) || sampledAtMonotonicMs < 0)) { await this.interrupt(); return; }
    if (this.state.manualPrepared && !this.state.leaseActive && this.canAcquire) {
      // Acquire only after explicit intent and a live gesture. Discard this sample:
      // the next live sample must drive, never the vector captured before the ACK.
      await this.acquire(); return;
    }
    if (!this.sessionId || !this.canUseManualControl) return;
    const at = this.now();
    if (side === 'both') { this.driveVector = { ...vector }; this.turnVector = { ...turn! }; this.driveAt = at; this.turnAt = at; }
    else if (side === 'drive') { this.driveVector = { ...vector }; this.driveAt = at; }
    else { this.turnVector = { ...vector }; this.turnAt = at; }
    // Never retain motion from an inactive/stale second touch channel.
    const driveAge = at - this.driveAt, turnAge = at - this.turnAt;
    if (!Number.isFinite(at) || nonzero(this.driveVector) && (driveAge < 0 || driveAge > INPUT_FRESH_MS)
      || this.turnVector.x !== 0 && (turnAge < 0 || turnAge > INPUT_FRESH_MS)) { await this.interrupt(); return; }
    this.inputAt = at;
    this.moving = nonzero(this.driveVector) || this.turnVector.x !== 0;
    if (!this.moving && this.inputBusy) { await this.interrupt(); return; }
    // Only a fresh touch sample can send. Pending samples are not queued/replayed.
    if (this.inputBusy || this.reading) return;
    const epoch = this.epoch; const id = this.sessionId; this.inputBusy = true;
    const previousSequence = this.state.sequence;
    try {
      // Operator/screen +X points right; Brainstem body +Y is left and +Z is CCW.
      const forward = -this.driveVector.y * .20;
      const lateral = -this.driveVector.x * .20;
      const yawRate = -this.turnVector.x * .30;
      const reply = await this.transport.input(id, forward === 0 ? 0 : forward, lateral === 0 ? 0 : lateral,
        yawRate === 0 ? 0 : yawRate, sampledAtMonotonicMs);
      if (!this.valid(epoch)) return;
      if (!reply.leaseActive || !(reply.leaseOwnerMatched ?? reply.principalVerified) || this.state.transport !== 'grpc-lan' && !reply.principalVerified || reply.sequence !== previousSequence + 1) throw new Error('Rejected or out-of-order ACK');
      this.apply(reply);
    } catch (error) { await this.fail(epoch, error); }
    finally { if (this.valid(epoch)) this.inputBusy = false; }
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
      this.busy = false;
      if (reply) this.apply({ ...reply, leaseActive: false });
      else this.publish({ phase: 'ready', status: null, observedAt: null });
    } }
    catch (error) { await this.fail(epoch, error); throw new Error(failureMessage(error)); }
  }

  async disconnect(): Promise<void> {
    const id = this.sessionId; const connection = this.verifiedConnection; this.sessionId = null; this.epoch++;
    this.busy = false; this.pendingAction = null; this.reading = false; this.inputBusy = false; this.acquiring = false; this.resetInput();
    this.publish({ ...initial(), ...(this.stopUnconfirmed ? { phase: 'error' as const, error: STOP_UNCONFIRMED_MESSAGE } : {}) });
    if (id) {
      await this.transport.interrupt(id).catch(() => this.recordStopFailure(connection));
      await this.transport.close(id).catch(() => undefined);
    }
  }
  dispose() { this.retired = true; this.listeners.clear(); void this.disconnect(); }

  get runtimeState(): ControlRuntimeState {
    const s = this.fresh() ? this.state.status : null;
    const profile = s ? this.state.profile : null;
    const terrain = profile ? terrainModeFromProfile(profile) : null;
    // An in-flight native action can outlast telemetry freshness without losing its channel.
    const awaitingAction = this.state.connected && this.pendingAction !== null;
    return { controlLink: s || awaitingAction ? 'connected' : 'disconnected', controlAuthority: this.canUseManualControl ? 'held' : 'not-held',
      // A private CA/client principal is separate from cloud ownership/binding.
      deviceIdentity: 'unbound', motorState: s ? s.motorOutputEnabled ? 'enabled' : 'disabled' : 'unknown',
      // Walking is not confirmation that a fixed-pose StandUp has completed.
      posture: s?.fsmKind === 'standing' ? 'standing' : s?.fsmKind === 'grounded' ? 'sitting' : 'unknown',
      faultStatus: s ? s.criticalMotorFault ? 'active' : 'clear' : 'unknown',
      currentPolicy: profile?.current ? { id: profile.current, label: profile.currentDescription || profile.current } : null,
      policyCatalogStatus: profile ? 'synced' : 'unknown', policyOptions: profile ? profileOptions(profile) : [],
      ...(terrain ? { terrainMode: { ...terrain, catalogStatus: 'synced' as const, source: 'device' as const } } : {}),
      speed: { linearMps: null, lateralMps: null, yawRps: null, source: 'unknown' }, inputSource: 'touch' };
  }
}
