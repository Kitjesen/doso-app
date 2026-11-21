import {
  WhepReceiver,
  videoOrigin,
  type VideoConfiguration,
  type VideoRuntime,
  type VideoSnapshot,
  type VideoStream,
} from './whepReceiver';

const RECEIVER_RETRY_MAX_MS = 8000;
const RECEIVER_FREEZE_TIMEOUT_MS = 3000;
const FRAME_POLL_INTERVAL_MS = 45;
const WHEP_PROBE_TIMEOUT_MS = 1200;
const SIM_REQUEST_TIMEOUT_MS = 2000;

export type DecodedSimFrame = Readonly<{
  source: unknown;
  width: number;
  height: number;
  close?: () => void;
}>;

export type LoopbackSimVideoStream = VideoStream & Readonly<{
  kind: 'doso-dev-sim-canvas';
  getLatestFrame: () => DecodedSimFrame | null;
  subscribe: (listener: () => void) => () => void;
}>;

export type LoopbackSimVideoRuntime = {
  fetch: typeof fetch;
  now: () => number;
  setTimeout: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  clearTimeout: (handle: ReturnType<typeof setTimeout>) => void;
  decodeFrame: (blob: Blob) => Promise<DecodedSimFrame>;
  createWhepReceiver?: (
    config: VideoConfiguration,
    publish: (snapshot: VideoSnapshot) => void,
  ) => { start(): void; stop(): Promise<boolean> };
};

export function isDevLoopbackSimVideoConfig(config: VideoConfiguration, isDev: boolean): boolean {
  if (!isDev || config.viewerToken !== undefined || config.allowLocalHttp !== true) return false;
  try {
    const url = new URL(videoOrigin(config));
    return url.protocol === 'http:' && (url.hostname === '127.0.0.1' || url.hostname === 'localhost');
  } catch {
    return false;
  }
}

let simSequence = 0;

function createCanvasStream(initialStop: () => void): LoopbackSimVideoStream & {
  pushFrame: (frame: DecodedSimFrame) => void;
  dispose: () => void;
} {
  let latest: DecodedSimFrame | null = null;
  let stopped = false;
  const listeners = new Set<() => void>();

  const releaseLatest = () => {
    const prev = latest;
    latest = null;
    try {
      prev?.close?.();
    } catch {
      /* Ignore already closed bitmap. */
    }
  };

  return {
    kind: 'doso-dev-sim-canvas',
    getLatestFrame: () => latest,
    subscribe(listener) {
      if (stopped) return () => { };
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    pushFrame(frame) {
      if (stopped) {
        try { frame.close?.(); } catch { /* Ignore. */ }
        return;
      }
      const previous = latest;
      latest = frame;
      for (const listener of [...listeners]) {
        try { listener(); } catch { /* Ignore subscriber error. */ }
      }
      if (previous && previous !== frame) {
        try { previous.close?.(); } catch { /* Ignore. */ }
      }
    },
    dispose() {
      stopped = true;
      listeners.clear();
      releaseLatest();
    },
    getTracks: () => [{ stop: initialStop }],
    release() {
      stopped = true;
      listeners.clear();
      releaseLatest();
    },
  };
}

/**
 * __DEV__ loopback simulation video receiver.
 * Always probes real WHEP first so an authentic go2rtc gateway takes precedence,
 * and otherwise streams MuJoCo JPEG frames from 127.0.0.1/localhost only.
 */
export class LoopbackSimVideoReceiver {
  private active = false;
  private generation = 0;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionAbort: AbortController | null = null;
  private whepDelegate: { start(): void; stop(): Promise<boolean> } | null = null;
  private activeStream: ReturnType<typeof createCanvasStream> | null = null;
  private readonly origin: string;
  private readonly pollIntervalMs: number;
  private readonly freezeTimeoutMs: number;

  constructor(
    private readonly config: VideoConfiguration,
    private readonly runtime: LoopbackSimVideoRuntime,
    private readonly publish: (snapshot: VideoSnapshot) => void,
    options: { isDev?: boolean; pollIntervalMs?: number; freezeTimeoutMs?: number } = {},
  ) {
    const isDev = options.isDev ?? (typeof __DEV__ !== 'undefined' && __DEV__ === true);
    if (!isDevLoopbackSimVideoConfig(config, isDev)) {
      throw new Error('Loopback sim video requires __DEV__ loopback HTTP config without token');
    }
    this.origin = videoOrigin(config);
    this.pollIntervalMs = options.pollIntervalMs ?? FRAME_POLL_INTERVAL_MS;
    this.freezeTimeoutMs = options.freezeTimeoutMs ?? RECEIVER_FREEZE_TIMEOUT_MS;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.attempt = 0;
    const gen = ++this.generation;
    void this.runSession(gen);
  }

  async stop(): Promise<boolean> {
    this.active = false;
    this.generation += 1;
    this.clearTimers();
    this.sessionAbort?.abort();
    this.sessionAbort = null;
    this.disposeActiveStream();
    const delegate = this.whepDelegate;
    this.whepDelegate = null;
    if (delegate) {
      return await delegate.stop().catch(() => false);
    }
    return true;
  }

  private current(gen: number): boolean {
    return this.active && this.generation === gen;
  }

  private clearTimers(): void {
    if (this.retryTimer !== null) {
      this.runtime.clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.pollTimer !== null) {
      this.runtime.clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private disposeActiveStream(): void {
    if (this.activeStream) {
      this.activeStream.dispose();
      this.activeStream = null;
    }
  }

  private async fetchWithTimeout(
    gen: number,
    url: string,
    timeoutMs: number,
  ): Promise<Response> {
    const requestAbort = new AbortController();
    const outerSignal = this.sessionAbort?.signal;
    const onOuterAbort = () => requestAbort.abort();
    if (outerSignal?.aborted) {
      throw new Error('aborted');
    }
    outerSignal?.addEventListener('abort', onOuterAbort, { once: true });
    const timer = this.runtime.setTimeout(() => requestAbort.abort(), timeoutMs);
    try {
      const response = await this.runtime.fetch(url, {
        method: 'GET',
        credentials: 'omit',
        redirect: 'error',
        signal: requestAbort.signal,
      });
      if (!this.current(gen)) throw new Error('retired');
      return response;
    } finally {
      this.runtime.clearTimeout(timer);
      outerSignal?.removeEventListener('abort', onOuterAbort);
    }
  }

  private scheduleRetry(gen: number, delayMs?: number): void {
    if (!this.current(gen)) return;
    const waitMs = delayMs ?? Math.min(RECEIVER_RETRY_MAX_MS, 1000 * 2 ** Math.min(this.attempt++, 3));
    this.clearTimers();
    this.retryTimer = this.runtime.setTimeout(() => {
      this.retryTimer = null;
      if (!this.active) return;
      const nextGen = ++this.generation;
      void this.runSession(nextGen);
    }, waitMs);
  }

  private async waitPoll(gen: number): Promise<boolean> {
    if (!this.current(gen)) return false;
    return await new Promise<boolean>((resolve) => {
      this.pollTimer = this.runtime.setTimeout(() => {
        this.pollTimer = null;
        resolve(this.current(gen));
      }, this.pollIntervalMs);
    });
  }

  private async runSession(gen: number): Promise<void> {
    if (!this.current(gen)) return;
    this.sessionAbort?.abort();
    this.sessionAbort = new AbortController();
    this.disposeActiveStream();

    const sessionId = `sim-video-${++simSequence}`;
    this.publish({ id: sessionId, phase: 'connecting', stream: null, rotation: 0, error: null });

    // 1. Real WHEP endpoint takes precedence whenever available on localhost/127.0.0.1.
    if (this.runtime.createWhepReceiver) {
      try {
        const whepRes = await this.fetchWithTimeout(
          gen,
          `${this.origin}/api/v1/webrtc/status`,
          WHEP_PROBE_TIMEOUT_MS,
        );
        if (!this.current(gen)) return;
        if (whepRes.ok) {
          const whepJson = await whepRes.json().catch(() => null) as { available?: unknown } | null;
          if (!this.current(gen)) return;
          if (whepJson?.available === true) {
            const whep = this.runtime.createWhepReceiver(this.config, (snapshot) => {
              if (this.current(gen)) this.publish(snapshot);
            });
            this.whepDelegate = whep;
            whep.start();
            return;
          }
        }
      } catch {
        if (!this.current(gen)) return;
      }
    }

    // 2. Verify simulation video server status endpoint.
    let statusReady = false;
    try {
      const statusRes = await this.fetchWithTimeout(
        gen,
        `${this.origin}/api/v1/sim/video/status`,
        SIM_REQUEST_TIMEOUT_MS,
      );
      if (!this.current(gen)) return;
      if (statusRes.ok) {
        const payload = await statusRes.json().catch(() => null) as {
          ok?: unknown;
          simulation?: unknown;
          available?: unknown;
          source_ready?: unknown;
        } | null;
        if (
          payload
          && payload.ok === true
          && payload.simulation === true
          && payload.available === true
          && payload.source_ready !== false
        ) {
          statusReady = true;
        }
      }
    } catch {
      if (!this.current(gen)) return;
    }

    if (!this.current(gen)) return;
    if (!statusReady) {
      this.publish({ id: sessionId, phase: 'error', stream: null, rotation: 0, error: 'unavailable' });
      this.scheduleRetry(gen);
      return;
    }

    // 3. Stream decoded JPEG simulation frames sequentially with monotonic seq + freeze watchdog.
    const stream = createCanvasStream(() => {
      if (this.generation === gen) void this.stop();
    });
    this.activeStream = stream;

    let lastSeq = 0;
    let lastAdvanceAt: number | null = null;
    let startedReceiving = false;
    let consecutiveErrors = 0;

    const camParam = this.config.cameraId === 'front' || this.config.cameraId === 'rear' || this.config.cameraId === 'follow'
      ? `&cam=${encodeURIComponent(this.config.cameraId)}`
      : '';

    while (this.current(gen)) {
      const ts = Math.max(0, Math.floor(this.runtime.now()));
      try {
        const res = await this.fetchWithTimeout(
          gen,
          `${this.origin}/api/v1/sim/video/frame.jpg?ts=${ts}${camParam}`,
          SIM_REQUEST_TIMEOUT_MS,
        );
        if (!this.current(gen)) return;

        if (!res.ok) {
          consecutiveErrors += 1;
        } else {
          const seqHeader = res.headers.get('X-Doso-Frame-Seq') ?? res.headers.get('x-doso-frame-seq');
          const parsedSeq = seqHeader ? Number.parseInt(seqHeader.trim(), 10) : Number.NaN;
          if (Number.isInteger(parsedSeq) && parsedSeq > lastSeq) {
            const blob = await res.blob();
            if (!this.current(gen)) return;
            const decoded = await this.runtime.decodeFrame(blob);
            if (!this.current(gen)) {
              try { decoded.close?.(); } catch { /* Ignore. */ }
              return;
            }
            consecutiveErrors = 0;
            lastSeq = parsedSeq;
            lastAdvanceAt = this.runtime.now();
            stream.pushFrame(decoded);
            if (!startedReceiving) {
              startedReceiving = true;
              this.attempt = 0;
            }
            this.publish({
              id: sessionId,
              phase: 'receiving',
              stream,
              rotation: 0,
              error: null,
            });
          } else if (Number.isInteger(parsedSeq)) {
            consecutiveErrors = 0;
          } else {
            consecutiveErrors += 1;
          }
        }
      } catch {
        if (!this.current(gen)) return;
        consecutiveErrors += 1;
      }

      const now = this.runtime.now();
      if (startedReceiving && lastAdvanceAt !== null && now - lastAdvanceAt >= this.freezeTimeoutMs) {
        this.disposeActiveStream();
        this.publish({ id: sessionId, phase: 'stalled', stream: null, rotation: 0, error: 'frozen' });
        this.scheduleRetry(gen, 1000);
        return;
      }

      if (!startedReceiving && consecutiveErrors >= 3) {
        this.disposeActiveStream();
        this.publish({ id: sessionId, phase: 'error', stream: null, rotation: 0, error: 'unavailable' });
        this.scheduleRetry(gen);
        return;
      }

      if (!(await this.waitPoll(gen))) return;
    }
  }
}

export function createWhepOrSimVideoReceiver(
  config: VideoConfiguration,
  runtime: VideoRuntime,
  publish: (snapshot: VideoSnapshot) => void,
  options: {
    isDev: boolean;
    createWhep: () => WhepReceiver;
    decodeFrame?: (blob: Blob) => Promise<DecodedSimFrame>;
  },
): WhepReceiver | LoopbackSimVideoReceiver {
  if (!options.decodeFrame || !isDevLoopbackSimVideoConfig(config, options.isDev)) {
    return options.createWhep();
  }
  return new LoopbackSimVideoReceiver(
    config,
    {
      fetch: runtime.fetch,
      now: runtime.now,
      setTimeout: runtime.setTimeout,
      clearTimeout: runtime.clearTimeout,
      decodeFrame: options.decodeFrame,
      createWhepReceiver: (cfg, pub) => new (options.createWhep().constructor as typeof WhepReceiver)(cfg, runtime, pub),
    },
    publish,
    { isDev: options.isDev },
  );
}

