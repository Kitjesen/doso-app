// Receive-only WHEP against the robot video probe.
// One viewer session owns its offer, answer, and session DELETE.
import { isVideoProbeBaseUrl, VIDEO_PROBE_STREAM_SRC } from './videoProbeUrl';

export const VIDEO_PROBE_ICE_GATHERING_BUDGET_MS = 35_000;
export const VIDEO_PROBE_POST_BUDGET_MS = 40_000;
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 8_000;

export type VideoProbeIceServer = {
  urls?: string | string[];
  username?: string;
  credential?: string;
};

export type VideoProbeStream = {
  toURL?: () => string;
};

export type VideoProbeFailure = 'unavailable' | 'signalling' | 'ice';

export type VideoProbeView = {
  id: string;
  phase: 'connecting' | 'receiving' | 'stalled' | 'error';
  stream: VideoProbeStream | null;
  rotationDegrees: number;
};

type ProbeResponse = {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text: () => Promise<string>;
  json: () => Promise<unknown>;
};

export type VideoProbePeer = {
  iceGatheringState: string;
  connectionState: string;
  iceConnectionState?: string;
  localDescription: { sdp?: string | null; type?: string } | null;
  addEventListener(type: string, listener: (event?: { streams?: VideoProbeStream[] }) => void): void;
  removeEventListener(type: string, listener: (event?: { streams?: VideoProbeStream[] }) => void): void;
  addTransceiver(kind: 'video', init: { direction: 'recvonly' }): void;
  createOffer(): Promise<{ sdp?: string | null; type?: string }>;
  setLocalDescription(description: { type?: string; sdp?: string | null }): Promise<void>;
  setRemoteDescription(description: { type: 'answer'; sdp: string }): Promise<void>;
  getReceivers(): Array<{ track?: { stop?: () => void } | null }>;
  close(): void;
};

export type VideoProbeRuntime = {
  createPeerConnection: (configuration: { iceServers: VideoProbeIceServer[] }) => VideoProbePeer;
  fetch: (input: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  }) => Promise<ProbeResponse>;
  setTimeout: (callback: () => void, delay: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

export type VideoProbeOptions = {
  baseUrl: string;
  streamSrc?: string;
  runtime: VideoProbeRuntime;
  authorization?: () => Promise<string | null>;
  onView: (view: VideoProbeView) => void;
  iceGatheringTimeoutMs?: number;
  postTimeoutMs?: number;
  retryMinMs?: number;
  retryMaxMs?: number;
};

type SessionCallbacks = {
  onStream: (stream: VideoProbeStream) => void;
  onConnected: () => void;
  onTerminal: (failure: VideoProbeFailure, wasLive: boolean) => void;
};

function endpointForSource(whepPath: string, streamSrc: string): string {
  if (!streamSrc) return whepPath;
  const separator = whepPath.includes('?') ? '&' : '?';
  return `${whepPath}${separator}src=${encodeURIComponent(streamSrc)}`;
}

function resolveResourceLocation(location: string, requestUrl: string): string | null {
  if (!location || /[\r\n]/.test(location)) return null;
  try {
    const base = new URL(requestUrl);
    const resolved = new URL(location, base);
    if (resolved.protocol !== base.protocol || resolved.host !== base.host) return null;
    if (resolved.username || resolved.password) return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

function iceServersFrom(value: unknown): VideoProbeIceServer[] {
  if (!Array.isArray(value)) return [];
  const servers: VideoProbeIceServer[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const urls = record.urls;
    const server: VideoProbeIceServer = {};
    if (typeof urls === 'string' && urls.trim()) server.urls = urls.trim();
    else if (Array.isArray(urls)) {
      const list = urls.filter((url): url is string => typeof url === 'string' && url.trim().length > 0).map(url => url.trim());
      if (list.length) server.urls = list;
    }
    if (!server.urls) continue;
    if (typeof record.username === 'string') server.username = record.username;
    if (typeof record.credential === 'string') server.credential = record.credential;
    servers.push(server);
  }
  return servers;
}

function rotationFrom(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function safeToken(value: string | null): string | null {
  if (!value) return null;
  const token = value.trim();
  if (!token || token.length > 4096 || /[\r\n]/.test(token)) return null;
  return token;
}

function authHeaders(token: string | null, extra?: Record<string, string>): Record<string, string> | undefined {
  const headers = { ...(extra ?? {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return Object.keys(headers).length ? headers : undefined;
}

class WhepSession {
  private readonly abort = new AbortController();
  private readonly peer: VideoProbePeer;
  private active = true;
  private live = false;
  private stream: VideoProbeStream | null = null;
  private resourceLocation: string | null = null;
  private resourceEtag: string | null = null;
  private deletePromise: Promise<void> | null = null;
  private postInFlight = false;
  private postCleanupTimer: unknown = null;
  private iceTimer: unknown = null;
  private iceListener: (() => void) | null = null;
  private readonly trackListener: (event?: { streams?: VideoProbeStream[] }) => void;
  private readonly stateListener: () => void;
  readonly done: Promise<void>;

  constructor(
    private readonly requestUrl: string,
    private readonly runtime: VideoProbeRuntime,
    private readonly callbacks: SessionCallbacks,
    private readonly iceGatheringTimeoutMs: number,
    private readonly postTimeoutMs: number,
    iceServers: VideoProbeIceServer[],
    private readonly token: string | null,
  ) {
    this.peer = runtime.createPeerConnection({ iceServers });
    this.trackListener = event => {
      if (!this.active) return;
      const stream = event?.streams?.[0];
      if (!stream) return;
      this.stream = stream;
      this.callbacks.onStream(stream);
      this.publishLive();
    };
    this.stateListener = () => {
      if (!this.active) return;
      if (this.peerUp()) {
        this.callbacks.onConnected();
        this.publishLive();
        return;
      }
      const connection = this.peer.connectionState;
      const ice = this.peer.iceConnectionState;
      if (connection === 'failed' || connection === 'disconnected' || ice === 'failed' || ice === 'disconnected') {
        this.fail('ice');
      }
    };
    this.peer.addEventListener('track', this.trackListener);
    this.peer.addEventListener('connectionstatechange', this.stateListener);
    this.peer.addEventListener('iceconnectionstatechange', this.stateListener);
    this.peer.addTransceiver('video', { direction: 'recvonly' });
    this.done = this.negotiate();
  }

  private peerUp(): boolean {
    return this.peer.connectionState === 'connected'
      || this.peer.iceConnectionState === 'connected'
      || this.peer.iceConnectionState === 'completed';
  }

  private publishLive(): void {
    if (!this.active || this.live || !this.stream) return;
    const url = typeof this.stream.toURL === 'function' ? this.stream.toURL() : '';
    if (!url) return;
    this.live = true;
  }

  private async waitForIceGathering(): Promise<void> {
    if (this.peer.iceGatheringState === 'complete' || !this.active) return;
    await new Promise<void>(resolve => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        if (this.iceListener) {
          this.peer.removeEventListener('icegatheringstatechange', this.iceListener);
          this.iceListener = null;
        }
        if (this.iceTimer) {
          this.runtime.clearTimeout(this.iceTimer);
          this.iceTimer = null;
        }
        this.abort.signal.removeEventListener('abort', finish);
        resolve();
      };
      this.iceListener = () => {
        if (this.peer.iceGatheringState === 'complete') finish();
      };
      this.peer.addEventListener('icegatheringstatechange', this.iceListener);
      this.abort.signal.addEventListener('abort', finish, { once: true });
      this.iceTimer = this.runtime.setTimeout(finish, this.iceGatheringTimeoutMs);
    });
  }

  private async negotiate(): Promise<void> {
    try {
      const offer = await this.peer.createOffer();
      if (!this.active) return;
      await this.peer.setLocalDescription(offer);
      if (!this.active) return;
      await this.waitForIceGathering();
      if (!this.active) return;
      const local = this.peer.localDescription;
      if (!local?.sdp) throw new Error('offer has no local description');

      this.postInFlight = true;
      this.postCleanupTimer = this.runtime.setTimeout(() => {
        this.postCleanupTimer = null;
        this.postInFlight = false;
        this.abort.abort();
        if (this.active) this.fail('signalling');
      }, this.postTimeoutMs);
      let response: ProbeResponse;
      try {
        response = await this.runtime.fetch(this.requestUrl, {
          method: 'POST',
          headers: authHeaders(this.token, { 'Content-Type': 'application/sdp' }),
          body: local.sdp,
          signal: this.abort.signal,
        });
      } finally {
        this.postInFlight = false;
        if (this.postCleanupTimer) {
          this.runtime.clearTimeout(this.postCleanupTimer);
          this.postCleanupTimer = null;
        }
      }
      const location = response.headers.get('location') ?? response.headers.get('Location');
      if (location) this.resourceLocation = resolveResourceLocation(location, this.requestUrl);
      const etag = response.headers.get('etag') ?? response.headers.get('ETag');
      this.resourceEtag = etag && !/[\r\n]/.test(etag) && etag.length <= 256 ? etag : null;
      if (!this.active) {
        await this.deleteResource();
        return;
      }
      if (!response.ok) {
        this.fail(response.status === 503 ? 'unavailable' : 'signalling');
        return;
      }
      const answerSdp = (await response.text()).trim();
      if (!this.active) return;
      if (!answerSdp) {
        this.fail('signalling');
        return;
      }
      await this.peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      if (this.active) this.publishLive();
    } catch (error) {
      if (!this.active || (error as { name?: string }).name === 'AbortError') return;
      this.fail('signalling');
    }
  }

  private fail(failure: VideoProbeFailure): void {
    if (!this.active) return;
    const wasLive = this.live;
    void this.close();
    this.callbacks.onTerminal(failure, wasLive);
  }

  private deleteResource(): Promise<void> {
    if (!this.resourceLocation) return Promise.resolve();
    if (!this.deletePromise) {
      const resource = this.resourceLocation;
      const etag = this.resourceEtag;
      this.resourceLocation = null;
      this.resourceEtag = null;
      const headers: Record<string, string> = {};
      if (this.token) headers.Authorization = `Bearer ${this.token}`;
      if (etag) headers['If-Match'] = etag;
      this.deletePromise = this.runtime.fetch(resource, {
        method: 'DELETE',
        headers: Object.keys(headers).length ? headers : undefined,
      }).then(() => undefined).catch(() => undefined);
    }
    return this.deletePromise;
  }

  async close(): Promise<void> {
    if (this.active) {
      this.active = false;
      if (!this.postInFlight) this.abort.abort();
      else if (!this.postCleanupTimer) {
        this.postCleanupTimer = this.runtime.setTimeout(() => {
          this.postCleanupTimer = null;
          this.abort.abort();
        }, this.postTimeoutMs);
      }
      if (this.iceListener) {
        this.peer.removeEventListener('icegatheringstatechange', this.iceListener);
        this.iceListener = null;
      }
      if (this.iceTimer) {
        this.runtime.clearTimeout(this.iceTimer);
        this.iceTimer = null;
      }
      this.peer.removeEventListener('track', this.trackListener);
      this.peer.removeEventListener('connectionstatechange', this.stateListener);
      this.peer.removeEventListener('iceconnectionstatechange', this.stateListener);
      for (const receiver of this.peer.getReceivers()) {
        try { receiver.track?.stop?.(); } catch { /* the peer is already going away */ }
      }
      try { this.peer.close(); } catch { /* already closed */ }
    }
    await this.deleteResource();
  }
}

class VideoProbeController {
  private readonly runtime: VideoProbeRuntime;
  private readonly iceGatheringTimeoutMs: number;
  private readonly postTimeoutMs: number;
  private readonly retryMinMs: number;
  private readonly retryMaxMs: number;
  private session: WhepSession | null = null;
  private retryTimer: unknown = null;
  private retryAttempt = 0;
  private generation = 0;
  private active = false;
  private pending: Promise<void> = Promise.resolve();
  private viewSerial = 0;
  private rotationDegrees = 0;
  private statusAbort: AbortController | null = null;

  constructor(private readonly options: VideoProbeOptions) {
    this.runtime = options.runtime;
    this.iceGatheringTimeoutMs = options.iceGatheringTimeoutMs ?? VIDEO_PROBE_ICE_GATHERING_BUDGET_MS;
    this.postTimeoutMs = options.postTimeoutMs ?? VIDEO_PROBE_POST_BUDGET_MS;
    this.retryMinMs = Math.max(1, options.retryMinMs ?? RETRY_MIN_MS);
    this.retryMaxMs = Math.max(this.retryMinMs, options.retryMaxMs ?? RETRY_MAX_MS);
  }

  start(): void {
    if (this.active) return;
    if (!isVideoProbeBaseUrl(this.options.baseUrl)) {
      this.emit('error', null, 'video-probe-rejected');
      return;
    }
    this.active = true;
    this.retryAttempt = 0;
    this.track(this.attempt(++this.generation));
  }

  async stop(): Promise<void> {
    this.active = false;
    this.generation += 1;
    this.clearRetry();
    this.statusAbort?.abort();
    this.statusAbort = null;
    const session = this.session;
    this.session = null;
    await session?.close();
    await this.pending;
  }

  settled(): Promise<void> {
    return this.pending;
  }

  private track(work: Promise<void>): void {
    this.pending = this.pending.then(() => work, () => work);
  }

  private emit(phase: VideoProbeView['phase'], stream: VideoProbeStream | null, id = `video-probe-${++this.viewSerial}`): void {
    this.options.onView({ id, phase, stream: phase === 'receiving' ? stream : null, rotationDegrees: this.rotationDegrees });
  }

  private async token(): Promise<string | null> {
    if (!this.options.authorization) return null;
    try {
      return safeToken(await this.options.authorization());
    } catch {
      return null;
    }
  }

  private async attempt(generation: number): Promise<void> {
    if (!this.active || generation !== this.generation) return;
    const id = `video-probe-${++this.viewSerial}`;
    this.emit('connecting', null, id);
    try {
      await this.attemptOnce(generation, id);
    } catch {
      if (!this.active || generation !== this.generation) return;
      this.emit('error', null, id);
      this.scheduleReconnect(generation);
    }
  }

  private async attemptOnce(generation: number, id: string): Promise<void> {
    const token = await this.token();
    if (!this.active || generation !== this.generation) return;
    const statusAbort = new AbortController();
    this.statusAbort = statusAbort;
    let status: { iceServers: VideoProbeIceServer[]; rotationDegrees: number } | null = null;
    try {
      const response = await this.runtime.fetch(`${this.options.baseUrl}/api/v1/webrtc/status`, {
        headers: authHeaders(token),
        signal: statusAbort.signal,
      });
      if (!this.active || generation !== this.generation) return;
      if (response.ok) {
        const body = await response.json() as { available?: unknown; ice_servers?: unknown; rotation_degrees?: unknown };
        if (body?.available === true) {
          this.rotationDegrees = rotationFrom(body.rotation_degrees);
          status = { iceServers: iceServersFrom(body.ice_servers), rotationDegrees: this.rotationDegrees };
        }
      }
    } catch (error) {
      if (!this.active || generation !== this.generation || (error as { name?: string }).name === 'AbortError') return;
    } finally {
      if (this.statusAbort === statusAbort) this.statusAbort = null;
    }
    if (!this.active || generation !== this.generation) return;
    if (!status) {
      this.emit('error', null, id);
      this.scheduleReconnect(generation);
      return;
    }
    await this.openSession(generation, id, status.iceServers, token);
  }

  private async openSession(generation: number, id: string, iceServers: VideoProbeIceServer[], token: string | null): Promise<void> {
    if (!this.active || generation !== this.generation) return;
    let stream: VideoProbeStream | null = null;
    let connected = false;
    let live = false;
    const publish = () => {
      if (!this.isCurrent(generation) || live || !connected || !stream) return;
      const url = typeof stream.toURL === 'function' ? stream.toURL() : '';
      if (!url) return;
      live = true;
      this.retryAttempt = 0;
      this.options.onView({ id, phase: 'receiving', stream, rotationDegrees: this.rotationDegrees });
    };
    const session = new WhepSession(
      endpointForSource(`${this.options.baseUrl}/api/v1/webrtc/whep`, this.options.streamSrc ?? VIDEO_PROBE_STREAM_SRC),
      this.runtime,
      {
        onStream: next => {
          if (!this.isCurrent(generation) || this.session !== session) return;
          stream = next;
          publish();
        },
        onConnected: () => {
          if (!this.isCurrent(generation) || this.session !== session) return;
          connected = true;
          publish();
        },
        onTerminal: (failure, wasLive) => {
          if (!this.isCurrent(generation) || this.session !== session) return;
          this.session = null;
          this.options.onView({
            id,
            phase: wasLive || live ? 'stalled' : 'error',
            stream: null,
            rotationDegrees: this.rotationDegrees,
          });
          this.scheduleReconnect(generation);
        },
      },
      this.iceGatheringTimeoutMs,
      this.postTimeoutMs,
      iceServers,
      token,
    );
    this.session = session;
    await session.done;
  }

  private isCurrent(generation: number): boolean {
    return this.active && generation === this.generation;
  }

  private scheduleReconnect(generation: number): void {
    if (!this.active || generation !== this.generation || this.retryTimer) return;
    const delay = Math.min(this.retryMaxMs, this.retryMinMs * 2 ** this.retryAttempt);
    this.retryAttempt += 1;
    this.retryTimer = this.runtime.setTimeout(() => {
      this.retryTimer = null;
      if (!this.active || generation !== this.generation) return;
      this.track(this.attempt(generation));
    }, delay);
  }

  private clearRetry(): void {
    if (!this.retryTimer) return;
    this.runtime.clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

export function startVideoProbe(options: VideoProbeOptions): { stop: () => Promise<void>; settled: () => Promise<void> } {
  const controller = new VideoProbeController(options);
  controller.start();
  return { stop: () => controller.stop(), settled: () => controller.settled() };
}
