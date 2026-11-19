import { videoAccess, VideoAccessError } from './access';
import { WhepReceiver, videoOrigin, type VideoConfiguration, type VideoRuntime, type VideoSnapshot } from './whepReceiver';

const pending = new Map<string, Promise<void>>();

/** Serializes credential changes with media cleanup for the same account and device. */
export class CloudViewer {
  private active = false;
  private readonly abort = new AbortController();
  private finished: Promise<void> = Promise.resolve();
  private wake: (() => void) | null = null;

  constructor(private config: VideoConfiguration, private userId: string, private runtime: VideoRuntime, private publish: (snapshot: VideoSnapshot) => void) {
    if (config.viewerToken || !videoOrigin(config).startsWith('https://')) throw new VideoAccessError('configuration');
  }

  start() {
    if (this.active || this.abort.signal.aborted) return;
    this.active = true;
    const key = JSON.stringify([this.userId, this.config.deviceId]);
    this.finished = (pending.get(key) ?? Promise.resolve()).then(() => this.run());
    pending.set(key, this.finished);
    void this.finished.then(() => { if (pending.get(key) === this.finished) pending.delete(key); });
  }

  stop() {
    this.active = false;
    this.abort.abort();
    this.wake?.();
    return this.finished;
  }

  private wait(milliseconds: number) {
    return new Promise<void>(resolve => {
      const timer = this.runtime.setTimeout(resolve, milliseconds);
      this.wake = () => { this.runtime.clearTimeout(timer); resolve(); };
    }).finally(() => { this.wake = null; });
  }

  private async run() {
    if (!this.active) return;
    let receiver: WhepReceiver | null = null;
    let requested = false;
    let expiresAt = 0;
    let cleanupAt = 0;
    let expiry: ReturnType<typeof setTimeout> | null = null;
    let retiring: Promise<boolean> | null = null;
    let received = false;
    let failures = 0;
    const release = async () => {
      if (expiry !== null) this.runtime.clearTimeout(expiry);
      expiry = null;
      const current = receiver;
      receiver = null;
      const released = current ? await current.stop() : true;
      // Keep a replacement behind server expiry if DELETE could not release the old resource.
      if (!released) await new Promise<void>(resolve => this.runtime.setTimeout(resolve, Math.max(0, cleanupAt - Date.now() + 1000)));
      return released;
    };
    try {
      while (this.active) {
        try {
          if (retiring) { await retiring; retiring = null; }
          if (!this.active) break;
          requested = true;
          const grant = await videoAccess(this.userId, this.config.deviceId, 'open', this.abort.signal);
          if (!this.active || !grant) break;
          if (retiring) { await retiring; retiring = null; }
          if (!this.active) break;
          if (grant.expiresAt <= Date.now()) throw new VideoAccessError('unavailable');
          cleanupAt = grant.expiresAt;
          if (receiver) {
            if (!await receiver.renew(grant.viewerToken)) throw new VideoAccessError('unavailable');
          } else {
            const waitingAt = Date.now();
            receiver = new WhepReceiver({ ...this.config, viewerToken: grant.viewerToken }, this.runtime, snapshot => {
              if (snapshot.phase === 'receiving') received = true;
              if (received && (snapshot.phase === 'connecting' || snapshot.phase === 'error' && snapshot.error === 'unavailable')) {
                this.publish({ ...snapshot, phase: 'stalled' });
              } else if (snapshot.phase === 'error' && snapshot.error === 'unavailable'
                || snapshot.phase === 'connecting' && Date.now() - waitingAt >= 15_000) {
                this.publish({ ...snapshot, phase: 'connecting', error: Date.now() - waitingAt < 15_000 ? 'warming' : 'unavailable' });
              } else this.publish(snapshot);
              if (snapshot.error === 'authorization') {
                this.active = false;
                this.abort.abort();
                this.wake?.();
              }
            });
            receiver.start();
          }
          if (!this.active) break;
          expiresAt = grant.expiresAt;
          failures = 0;
          if (expiry !== null) this.runtime.clearTimeout(expiry);
          expiry = this.runtime.setTimeout(() => {
            retiring = release();
            this.publish({ id: `cloud-video-${this.config.deviceId}`, phase: received ? 'stalled' : 'connecting', stream: null, rotation: 0, error: 'unavailable' });
            this.wake?.();
          }, Math.max(0, expiresAt - Date.now()));
          await this.wait(Math.max(1000, expiresAt - Date.now() - 20_000));
        } catch (error) {
          if (!this.active) break;
          if (error instanceof VideoAccessError && error.code !== 'unavailable') throw error;
          if (!receiver) this.publish({ id: `cloud-video-${this.config.deviceId}`, phase: received ? 'stalled' : 'connecting', stream: null, rotation: 0, error: 'unavailable' });
          await this.wait(Math.min(8000, 2000 * 2 ** Math.min(failures++, 2)));
        }
      }
    } catch (error) {
      if (this.active) this.publish({ id: `cloud-video-${this.config.deviceId}`, phase: 'error', stream: null, rotation: 0,
        error: error instanceof VideoAccessError ? error.code : 'unavailable' });
    } finally {
      const released = retiring ? await retiring : await release();
      if (requested && released) {
        try { await videoAccess(this.userId, this.config.deviceId, 'close'); }
        catch { /* Short server expiry completes cleanup when the account or network is unavailable. */ }
      }
      if (!released && this.active) this.publish({ id: `cloud-video-${this.config.deviceId}`, phase: 'error', stream: null, rotation: 0, error: 'connection' });
    }
  }
}
