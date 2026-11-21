export type VideoConfiguration = Readonly<{
  deviceId: string;
  gatewayUrl: string;
  allowLocalHttp?: boolean;
  viewerToken?: string;
  cameraId?: 'front' | 'rear' | 'follow';
}>;
export type VideoStream = { getTracks(): { stop(): void }[]; toURL?: () => string; release?: (releaseTracks?: boolean) => void };
export type VideoSnapshot = Readonly<{
  id: string;
  phase: 'unconfigured' | 'connecting' | 'receiving' | 'stalled' | 'error';
  stream: VideoStream | null;
  rotation: number;
  error: 'configuration' | 'authorization' | 'warming' | 'unavailable' | 'signalling' | 'connection' | 'frozen' | 'unsupported' | null;
}>;
type Peer = {
  connectionState: string; iceGatheringState: string; localDescription: { sdp?: string | null } | null;
  addTransceiver(kind: string, options: { direction: 'recvonly' }): unknown;
  addEventListener(event: string, listener: (event: any) => void): void;
  removeEventListener(event: string, listener: (event: any) => void): void;
  createOffer(): Promise<{ type: string; sdp?: string | null }>;
  setLocalDescription(offer: any): Promise<void>;
  setRemoteDescription(answer: { type: 'answer'; sdp: string }): Promise<void>;
  getStats(): Promise<{ forEach(callback: (report: any) => void): void }>;
  getReceivers(): { track?: { stop(): void } }[];
  close(): void;
};
export type VideoRuntime = {
  fetch: typeof fetch;
  createPeer(configuration: { iceServers: { urls: string | string[]; username?: string; credential?: string }[] }): Peer;
  makeStream(track: unknown): VideoStream;
  now(): number;
  setTimeout(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
};

export function videoOrigin(config: VideoConfiguration): string {
  const value = config.gatewayUrl.trim();
  const url = new URL(value);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const parts = host.split('.');
  const ipv4 = parts.length === 4 && parts.every(part => /^(0|[1-9][0-9]{0,2})$/.test(part) && +part <= 255);
  const local = host === 'localhost' || host === '::1' || ipv4 && (+parts[0] === 127 || +parts[0] === 10
    || +parts[0] === 192 && +parts[1] === 168 || +parts[0] === 172 && +parts[1] >= 16 && +parts[1] <= 31);
  const rawAuthority = /^https?:\/\/([^/?#]+)/i.exec(value)?.[1];
  if (!config.deviceId.trim() || config.deviceId.length > 2048 || url.username || url.password || url.search || url.hash
    || url.pathname !== '/' || !rawAuthority || value.includes('\\')
    || url.protocol !== 'https:' && !(url.protocol === 'http:' && config.allowLocalHttp === true && local)
    || url.protocol === 'http:' && rawAuthority.replace(/:[0-9]+$/, '').replace(/^\[|\]$/g, '') !== host) throw new Error('Invalid video configuration');
  if (config.viewerToken !== undefined && (url.protocol !== 'https:' || typeof config.viewerToken !== 'string'
    || config.viewerToken.length > 2048 || !/^[A-Za-z0-9._~+/-]+=*$/.test(config.viewerToken))) throw new Error('Invalid video configuration');
  return url.origin;
}

function resourceLocation(value: string, endpoint: string): string {
  const url = new URL(value, endpoint);
  const origin = new URL(endpoint).origin;
  if (url.origin !== origin || url.username || url.password || url.hash || !url.pathname.startsWith('/api/v1/webrtc/sessions/')
    || value.includes('\\') || /%2f|%5c|%2e/i.test(url.pathname)) throw new Error('Invalid media resource');
  return url.href;
}

let receiverSequence = 0;
/** Owns one device's receive-only media; Brainstem credentials and control messages stay separate. */
export class WhepReceiver {
  private active = false;
  private attempt = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private session: ReturnType<WhepReceiver['newSession']> | null = null;
  private retiring: Promise<boolean> = Promise.resolve(true);
  private readonly origin: string;
  private authorization: string | undefined;
  constructor(private config: VideoConfiguration, private runtime: VideoRuntime, private publish: (snapshot: VideoSnapshot) => void) {
    this.origin = videoOrigin(config);
    this.authorization = config.viewerToken === undefined ? undefined : `Bearer ${config.viewerToken}`;
  }
  start() { if (!this.active) { this.active = true; this.connect(); } }
  async stop(): Promise<boolean> {
    this.active = false;
    if (this.retry !== null) this.runtime.clearTimeout(this.retry);
    this.retry = null;
    const session = this.session;
    const released = this.retire(session);
    this.session = null;
    await session?.negotiation;
    const results = await Promise.all([this.retiring, released]);
    const lateResource = await this.deleteResource(session);
    return results.every(Boolean) && lateResource;
  }
  reconnect() { this.stop(); this.attempt = 0; this.start(); }
  async renew(viewerToken: string): Promise<boolean> {
    videoOrigin({ ...this.config, viewerToken });
    const credential = `Bearer ${viewerToken}`;
    this.authorization = credential;
    if (!this.active) return false;
    const session = this.session;
    if (!session?.resource || !this.current(session)) return true;
    try {
      const response = await this.request(`${session.resource}/renew`, { method: 'POST', headers: this.requestHeaders() }, 5000);
      if (credential !== this.authorization) return false;
      if (response.status === 401 || response.status === 403) {
        this.fail(session, 'authorization');
        return false;
      }
      return this.current(session) && response.status === 204;
    } catch { return false; }
  }
  private current(session: NonNullable<WhepReceiver['session']>) { return this.active && !session.retired && this.session === session; }
  private newSession() {
    return {
      id: `video-${++receiverSequence}`, retired: false, pc: null as Peer | null, stream: null as VideoStream | null,
      rotation: 0, abort: new AbortController(), postPending: false, resource: null as string | null, etag: null as string | null,
      timer: null as ReturnType<typeof setTimeout> | null, poll: null as ReturnType<typeof setTimeout> | null,
      iceFinish: null as (() => void) | null, listener: null as (() => void) | null, trackListener: null as ((event: any) => void) | null,
      stageCancel: null as (() => void) | null,
      connectedAt: null as number | null, lastFrameAt: null as number | null, decoded: 0, answerAt: null as number | null,
      negotiation: null as Promise<void> | null, deletion: null as Promise<boolean> | null,
    };
  }
  private emit(session: NonNullable<WhepReceiver['session']>, phase: VideoSnapshot['phase'], error: VideoSnapshot['error'] = null) {
    if (this.current(session)) this.publish({ id: session.id, phase, stream: phase === 'receiving' || phase === 'connecting' ? session.stream : null, rotation: session.rotation, error });
  }
  private connect() {
    if (!this.active) return;
    const session = this.newSession();
    this.session = session;
    this.emit(session, 'connecting');
    session.negotiation = this.negotiate(session).catch(() => this.fail(session, 'signalling'));
  }
  private async request(url: string, init: RequestInit, timeout: number): Promise<Response> {
    const abort = new AbortController();
    const timer = this.runtime.setTimeout(() => abort.abort(), timeout);
    try {
      return await this.runtime.fetch(url, { ...init, signal: abort.signal, credentials: 'omit', redirect: 'error' });
    } finally { this.runtime.clearTimeout(timer); }
  }
  private requestHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
    return this.authorization ? { ...headers, Authorization: this.authorization } : headers;
  }
  private async deleteResource(session: WhepReceiver['session']): Promise<boolean> {
    if (!session) return true;
    if (session.deletion) return session.deletion;
    const resource = session.resource;
    if (!resource) return true;
    session.deletion = (async () => {
      try {
        const response = await this.request(resource, { method: 'DELETE', headers: this.requestHeaders(session.etag ? { 'If-Match': session.etag } : undefined) }, 3000);
        if (!response.ok && response.status !== 404) return false;
        session.resource = null;
        return true;
      } catch { return false; }
    })();
    try { return await session.deletion; } finally { session.deletion = null; }
  }
  private retire(session: WhepReceiver['session']): Promise<boolean> {
    if (!session || session.retired) return this.deleteResource(session);
    session.retired = true;
    // Let a sent offer finish within its existing budget so a late Location can be deleted.
    if (!session.postPending) { session.abort.abort(); if (session.timer !== null) this.runtime.clearTimeout(session.timer); }
    if (session.poll !== null) this.runtime.clearTimeout(session.poll);
    session.iceFinish?.();
    session.stageCancel?.();
    if (session.pc) {
      if (session.listener) session.pc.removeEventListener('connectionstatechange', session.listener);
      if (session.trackListener) session.pc.removeEventListener('track', session.trackListener);
      try { for (const receiver of session.pc.getReceivers()) receiver.track?.stop(); } catch { /* Already disposed. */ }
      try { session.pc.close(); } catch { /* Already disposed. */ }
    }
    try { session.stream?.getTracks().forEach(track => track.stop()); session.stream?.release?.(false); } catch { /* Already disposed. */ }
    session.stream = null;
    return this.deleteResource(session);
  }
  private async stage<T>(session: NonNullable<WhepReceiver['session']>, operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const finish = (error: unknown, value?: T) => {
        if (settled) return;
        settled = true;
        this.runtime.clearTimeout(timer);
        session.stageCancel = null;
        if (error) reject(error); else resolve(value as T);
      };
      const timer = this.runtime.setTimeout(() => finish(new Error('Media negotiation timed out')), 10000);
      session.stageCancel = () => finish(new Error('Media session retired'));
      Promise.resolve().then(() => {
        if (!this.current(session)) throw new Error('Media session retired');
        return operation();
      }).then(value => finish(null, value), error => finish(error));
    });
  }
  private fail(session: NonNullable<WhepReceiver['session']>, error: NonNullable<VideoSnapshot['error']>) {
    if (!this.current(session)) return;
    this.emit(session, session.lastFrameAt !== null ? 'stalled' : 'error', error);
    this.retiring = Promise.all([this.retiring, this.retire(session)]).then(results => results.every(Boolean));
    this.session = null;
    if (error === 'authorization') { this.active = false; return; }
    const delay = Math.min(8000, 1000 * 2 ** Math.min(this.attempt++, 3));
    this.retry = this.runtime.setTimeout(() => { this.retry = null; this.connect(); }, delay);
  }
  private async negotiate(session: NonNullable<WhepReceiver['session']>) {
    const statusUrl = `${this.origin}/api/v1/webrtc/status`;
    const statusCredential = this.authorization;
    session.timer = this.runtime.setTimeout(() => session.abort.abort(), 5000);
    let response: Response;
    let status: any;
    try {
      response = await this.runtime.fetch(statusUrl, { headers: this.requestHeaders(), signal: session.abort.signal, credentials: 'omit', redirect: 'error' });
      if (response.ok && this.current(session)) status = await response.json();
    }
    finally { if (session.timer !== null) this.runtime.clearTimeout(session.timer); session.timer = null; }
    if (!this.current(session)) return;
    if (statusCredential !== this.authorization) return this.fail(session, 'unavailable');
    if (response.status === 401 || response.status === 403) return this.fail(session, 'authorization');
    if (!response.ok) return this.fail(session, 'unavailable');
    if (!status || status.available !== true || status.source_ready === false) return this.fail(session, 'unavailable');
    const iceServers = status.ice_servers ?? [];
    if (!Array.isArray(iceServers) || iceServers.length > 8 || iceServers.some(server => !server || typeof server !== 'object'
      || ![server.urls].flat().every(url => typeof url === 'string' && url.length < 2048 && /^(stun|stuns|turn|turns):[^\s]+$/i.test(url))
      || server.username != null && typeof server.username !== 'string' || server.credential != null && typeof server.credential !== 'string')) throw new Error('Invalid ICE configuration');
    session.rotation = [0, 90, 180, 270].includes(status.rotation_degrees) ? status.rotation_degrees : 0;
    const pc = this.runtime.createPeer({ iceServers });
    session.pc = pc;
    const track = (event: any) => {
      if (!this.current(session)) return;
      if (event.track?.kind !== 'video') { event.track?.stop(); return; }
      session.stream = event.streams?.[0] ?? this.runtime.makeStream(event.track);
      this.emit(session, session.lastFrameAt === null ? 'connecting' : 'receiving');
    };
    session.trackListener = track;
    session.listener = () => {
      if (!this.current(session)) return;
      if (pc.connectionState === 'connected' && session.connectedAt === null) session.connectedAt = this.runtime.now();
      if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) this.fail(session, 'connection');
    };
    pc.addEventListener('track', track);
    pc.addEventListener('connectionstatechange', session.listener);
    pc.addTransceiver('video', { direction: 'recvonly' });
    const offer = await this.stage(session, () => pc.createOffer());
    if (!this.current(session)) return;
    await this.stage(session, () => pc.setLocalDescription(offer));
    if (!this.current(session)) return;
    if (pc.iceGatheringState !== 'complete') await new Promise<void>(resolve => {
      let timer: ReturnType<typeof setTimeout>;
      const finish = () => { pc.removeEventListener('icegatheringstatechange', listener); this.runtime.clearTimeout(timer); session.iceFinish = null; resolve(); };
      const listener = () => { if (pc.iceGatheringState === 'complete') finish(); };
      timer = this.runtime.setTimeout(finish, 1500);
      session.iceFinish = finish;
      pc.addEventListener('icegatheringstatechange', listener);
    });
    if (!this.current(session)) return;
    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error('Missing local SDP');
    const endpoint = `${this.origin}/api/v1/webrtc/whep?src=cam`;
    const offerCredential = this.authorization;
    session.postPending = true;
    session.timer = this.runtime.setTimeout(() => session.abort.abort(), 40000);
    let answer = '';
    try {
      response = await this.runtime.fetch(endpoint, { method: 'POST', headers: this.requestHeaders({ 'Content-Type': 'application/sdp', Accept: 'application/sdp' }), body: sdp, signal: session.abort.signal, credentials: 'omit', redirect: 'error' });
      if (response.status === 401 || response.status === 403) return this.fail(session, offerCredential === this.authorization ? 'authorization' : 'unavailable');
      const location = response.headers.get('location');
      if (location) session.resource = resourceLocation(location, endpoint);
      session.etag = response.headers.get('etag');
      if (!this.current(session)) { await this.deleteResource(session); return; }
      if (offerCredential !== this.authorization) return this.fail(session, 'unavailable');
      if (response.status !== 200 && response.status !== 201) return this.fail(session, response.status === 503 ? 'unavailable' : 'signalling');
      answer = await response.text();
      if (!this.current(session)) return;
      if (offerCredential !== this.authorization) return this.fail(session, 'unavailable');
      if (!answer.startsWith('v=0') || answer.length > 262144 || response.status === 201 && !session.resource && status.backend !== 'go2rtc') throw new Error('Invalid WHEP answer');
    } finally {
      session.postPending = false;
      if (session.timer !== null) this.runtime.clearTimeout(session.timer);
      session.timer = null;
      if (session.retired) void this.deleteResource(session);
    }
    if (!this.current(session)) return;
    await this.stage(session, () => pc.setRemoteDescription({ type: 'answer', sdp: answer }));
    if (!this.current(session)) return;
    session.answerAt = this.runtime.now();
    session.listener();
    void this.poll(session);
  }
  private async poll(session: NonNullable<WhepReceiver['session']>) {
    if (!this.current(session) || !session.pc) return;
    try {
      let timeout: ReturnType<typeof setTimeout> | null = null;
      let stats: Awaited<ReturnType<Peer['getStats']>> | null;
      try { stats = await Promise.race([session.pc.getStats(), new Promise<null>(resolve => { timeout = this.runtime.setTimeout(() => resolve(null), 1000); })]); }
      finally { if (timeout !== null) this.runtime.clearTimeout(timeout); }
      if (!this.current(session)) return;
      let decoded = 0;
      stats?.forEach(report => { if (report.type === 'inbound-rtp' && (report.kind === 'video' || report.mediaType === 'video') && Number.isFinite(report.framesDecoded)) decoded += report.framesDecoded; });
      if (decoded > session.decoded && session.stream) {
        session.lastFrameAt = this.runtime.now();
        this.attempt = 0;
        this.emit(session, 'receiving');
      }
      session.decoded = decoded;
    } catch { /* The bounded frame watchdog also handles missing decode statistics. */ }
    if (!this.current(session)) return;
    const now = this.runtime.now();
    const freshnessOrigin = session.lastFrameAt ?? session.connectedAt;
    if (freshnessOrigin !== null && now - freshnessOrigin >= 3000) return this.fail(session, 'frozen');
    if (session.connectedAt === null && session.answerAt !== null && now - session.answerAt >= 10000) return this.fail(session, 'connection');
    session.poll = this.runtime.setTimeout(() => { session.poll = null; void this.poll(session); }, 500);
  }
}
