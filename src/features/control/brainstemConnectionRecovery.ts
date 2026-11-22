import type { BrainstemGrpcEndpoint } from '../../services/brainstemGrpc';
import type { BrainstemControlSession } from './brainstemControlSession';

type Target = Readonly<{ endpoint: BrainstemGrpcEndpoint; principal: string }>;
const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000];
const transient = (code: string | null) => code === 'unavailable' || code === 'timeout';
const key = (target: Target) => JSON.stringify([target.endpoint.host, target.endpoint.port,
  target.endpoint.transport ?? 'tls', target.endpoint.clientIdentityAlias ?? '', target.principal]);

/** Reopens status channels only; native open cannot enable motors or acquire a lease. */
export class BrainstemConnectionRecovery {
  private target: Target | null = null;
  private active = true;
  private available = true;
  private automaticEnabled = true;
  private paused = false;
  private generation = 0;
  private attempts = 0;
  private nextAt: number | null = null;
  private initialAttempt = false;
  private running: Promise<boolean> | null = null;
  private selectedKey: string | null = null;
  private suppressedKey: string | null = null;
  private blocked = false;
  private retryOpenBusy = false;
  private readonly session: BrainstemControlSession;
  private readonly now: () => number;
  private readonly onConnected: (endpoint: BrainstemGrpcEndpoint, principal: string) => void;

  constructor(session: BrainstemControlSession, now: () => number,
    onConnected: (endpoint: BrainstemGrpcEndpoint, principal: string) => void = () => {}) {
    this.session = session; this.now = now; this.onConnected = onConnected;
  }

  private retryableFailure() {
    const code = this.session.state.failureCode;
    // Native open may briefly share its admission gate with an existing telemetry read.
    return transient(code) || code === 'busy' && this.retryOpenBusy;
  }

  get reconnecting() {
    return !!this.target && this.active && this.available && this.automaticEnabled && !this.paused && !this.blocked && !this.session.state.connected
      && this.attempts < RETRY_DELAYS_MS.length && this.session.canReconnectAfterFailure
      && (this.initialAttempt || this.retryableFailure());
  }

  restore(endpoint: BrainstemGrpcEndpoint, principal: string) {
    const target = { endpoint: { ...endpoint }, principal };
    const targetKey = key(target);
    if (this.suppressedKey === targetKey) return;
    if (this.target && key(this.target) === targetKey && !this.paused) return;
    this.generation++; this.target = target; this.paused = false;
    if (this.selectedKey !== targetKey) { this.blocked = false; this.retryOpenBusy = false; }
    this.selectedKey = targetKey;
    this.attempts = 0; this.nextAt = this.now(); this.initialAttempt = true;
    void this.session.disconnect();
  }

  private opened(target: Target) {
    this.attempts = 0; this.nextAt = null; this.initialAttempt = false; this.retryOpenBusy = false; this.blocked = false;
    try { this.onConnected({ ...target.endpoint }, target.principal); } catch { /* Persistence cannot break a verified channel. */ }
  }

  async connect(endpoint: BrainstemGrpcEndpoint, principal: string): Promise<boolean> {
    const generation = ++this.generation;
    this.target = null; this.paused = false; this.initialAttempt = false;
    this.selectedKey = key({ endpoint, principal }); this.suppressedKey = null; this.blocked = false; this.retryOpenBusy = false;
    await this.session.disconnect();
    if (this.running) await this.running;
    if (generation !== this.generation || !this.active || !this.available || this.paused) return false;
    const target = { endpoint: { ...endpoint }, principal };
    const running = this.session.connect(target.endpoint, principal);
    this.running = running;
    try {
      const connected = await running;
      if (generation !== this.generation || !this.active || !this.available || this.paused) return false;
      if (connected) { this.target = target; this.opened(target); }
      return connected;
    } finally { if (this.running === running) this.running = null; }
  }

  async tick(): Promise<void> {
    if (this.session.state.failureCode && !this.retryableFailure()) this.blocked = true;
    if (!this.reconnecting || this.running || !this.target) return;
    const at = this.now();
    if (!Number.isFinite(at)) return;
    if (this.nextAt === null) { this.nextAt = at + RETRY_DELAYS_MS[this.attempts]; return; }
    if (at < this.nextAt) return;
    const target = this.target, generation = this.generation;
    this.attempts++; this.initialAttempt = false;
    this.retryOpenBusy = true;
    const running = this.session.connect(target.endpoint, target.principal, true);
    this.running = running;
    try {
      const connected = await running;
      if (generation !== this.generation || !this.active || !this.available || this.paused) return;
      if (connected) this.opened(target);
      else {
        this.retryOpenBusy = this.session.state.failureCode === 'busy';
        if (!this.retryableFailure()) this.blocked = true;
        this.nextAt = this.now() + (RETRY_DELAYS_MS[this.attempts] ?? RETRY_DELAYS_MS.at(-1)!);
      }
    } finally { if (this.running === running) this.running = null; }
  }

  setActive(active: boolean) {
    if (this.active === active) return;
    this.active = active; this.generation++;
    if (!active) {
      if (this.session.state.failureCode && !this.retryableFailure()) this.blocked = true;
      void this.session.disconnect(); return;
    }
    this.paused = false; this.attempts = 0; this.nextAt = this.now(); this.initialAttempt = true;
  }

  setAvailable(available: boolean) {
    if (this.available === available) return;
    this.available = available; this.generation++;
    if (!available) {
      if (this.session.state.failureCode && !this.retryableFailure()) this.blocked = true;
      void this.session.disconnect(); return;
    }
    this.paused = false; this.attempts = 0; this.nextAt = this.now(); this.initialAttempt = true;
  }

  setAutomaticEnabled(enabled: boolean) {
    if (this.automaticEnabled === enabled) return;
    this.automaticEnabled = enabled; this.generation++;
    if (!enabled) {
      if (this.session.state.failureCode && !this.retryableFailure()) this.blocked = true;
      void this.session.disconnect(); return;
    }
    this.paused = false; this.attempts = 0; this.nextAt = this.now(); this.initialAttempt = true;
  }

  suspend(): Promise<void> {
    this.generation++; this.paused = true;
    if (this.session.state.failureCode && !this.retryableFailure()) this.blocked = true;
    return this.session.disconnect();
  }

  disconnect(): Promise<void> {
    this.generation++; this.target = null; this.initialAttempt = false; this.nextAt = null;
    this.retryOpenBusy = false;
    this.suppressedKey = this.selectedKey;
    return this.session.disconnect();
  }
}
