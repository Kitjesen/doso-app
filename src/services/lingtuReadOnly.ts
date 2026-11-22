// @ts-expect-error Node's type stripping requires the explicit TypeScript extension.
import { ConnectionCheckError, diagnosticOrigin, readJson } from './brainstemReadOnly.ts';

export type LingtuReadOnlySnapshot = Readonly<{
  endpoint: string;
  observedAt: number;
  environment: 'real' | 'sim' | null;
  product: string | null;
  productSessionId: string | null;
  robotModel: string | null;
  robotOnline: null;
  motionAuthorized: false;
  localizationState: string | null;
  localizationReady: boolean | null;
  localizationPoseFresh: boolean | null;
  controlAuthority: string | null;
  resumeRequired: boolean | null;
  motionPermission: string | null;
  mapName: string | null;
  features: Readonly<Record<string, boolean>>;
  readiness: Readonly<{ ready: boolean; dataReady: boolean; motionReady: boolean;
    nonMotionSafe: boolean; reasons: readonly string[] }>;
}>;

export type CameraDiagnosticsSnapshot = Readonly<{
  cameraStatus: string | null;
  framesFresh: boolean | null;
  colorFrames: number | null;
  colorFps: number | null;
  depthFrames: number | null;
  depthFps: number | null;
  pipelineReady: boolean | null;
  whepAvailable: boolean | null;
}>;

export type LingtuMapLibrary = Readonly<{
  endpoint: string;
  observedAt: number;
  activeMapName: string | null;
  maps: readonly Readonly<{ name: string; contentEpoch: number | null; frameId: string | null;
    pointCount: number | null; hasPointCloud: boolean | null; hasOccupancy: boolean | null; state: string | null }>[];
  localization: Readonly<{ state: string | null; ready: boolean | null; poseFresh: boolean | null;
    frameId: string | null; x: number | null; y: number | null; z: number | null; yaw: number | null }> | null;
  motionAuthorized: false;
}>;

type ErrorCode = 'config' | 'unauthorized' | 'timeout' | 'cancelled' | 'unavailable' | 'invalid_response';
export class LingtuReadOnlyError extends Error {
  constructor(readonly code: ErrorCode) {
    super({
      config: '请输入 LingTu 服务地址；局域网 HTTP 仅用于测试。',
      unauthorized: '导航服务拒绝读取，请检查访问授权。',
      timeout: '导航服务读取超时，请检查网络后重试。',
      cancelled: '读取已取消。',
      unavailable: '无法读取导航服务，请检查地址和网络。',
      invalid_response: '导航状态无法核验，请检查服务版本或重新读取。',
    }[code]);
    this.name = 'LingtuReadOnlyError';
  }
}

const elapsedNow = () => {
  try { return typeof performance?.now === 'function' ? performance.now() : NaN; }
  catch { return NaN; }
};
const invalid = (): never => { throw new LingtuReadOnlyError('invalid_response'); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value)
  ? value as Record<string, unknown> : invalid();
const optionalObject = (value: unknown) => value == null ? {} : object(value);
const text = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 256) return invalid();
  return value.trim() || null;
};
const bool = (value: unknown): boolean | null => value == null ? null : typeof value === 'boolean' ? value : invalid();
const requiredBool = (value: unknown): boolean => typeof value === 'boolean' ? value : invalid();
const identity = (name: string, sources: Record<string, unknown>[]) => {
  const values = sources.map(source => text(source[name])).filter(value => value !== null);
  return new Set(values).size > 1 ? invalid() : values[0] ?? null;
};

const finiteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function isLingtuStatusFresh(snapshot: Readonly<{ observedAt: number }> | null | undefined, now = elapsedNow()): boolean {
  const age = snapshot ? now - snapshot.observedAt : NaN;
  return !!snapshot && Number.isFinite(snapshot.observedAt) && snapshot.observedAt >= 0
    && Number.isFinite(now) && now >= 0 && Number.isFinite(age) && age >= 0 && age < 15000;
}

export function validateLingtuOrigin(value: string, allowLocalHttp = false): string {
  try {
    const result = diagnosticOrigin(value, allowLocalHttp);
    if (result.startsWith('http:') && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]+)?\/?$/i.test(value.trim())) {
      throw new LingtuReadOnlyError('config');
    }
    return result;
  }
  catch {
    let url: URL;
    try { url = new URL(value.trim()); } catch { throw new LingtuReadOnlyError('config'); }
    const host = url.hostname, parts = host.split('.');
    const authority = /^http:\/\/([^/?#]+)/i.exec(value.trim())?.[1];
    const strictIpv4 = parts.length === 4 && parts.every(part => /^(0|[1-9][0-9]{0,2})$/.test(part) && Number(part) <= 255);
    const octets = parts.map(Number);
    const privateIpv4 = octets[0] === 10 || octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31
      || octets[0] === 192 && octets[1] === 168;
    // Unlike the credential-bearing diagnostic gateway, this path is anonymous, QA-only LAN HTTP.
    if (!allowLocalHttp || url.protocol !== 'http:' || !strictIpv4 || !privateIpv4
      || authority?.replace(/:[0-9]+$/, '') !== host || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new LingtuReadOnlyError('config');
    }
    return url.origin;
  }
}

/** Reads camera capture and gateway facts without claiming that depth is streamed to the client. */
export async function readCameraDiagnostics(options: {
  endpoint: string; allowLocalHttp?: boolean; signal?: AbortSignal; fetchImpl?: typeof fetch; timeoutMs?: number;
}): Promise<CameraDiagnosticsSnapshot> {
  const endpoint = validateLingtuOrigin(options.endpoint, options.allowLocalHttp === true);
  const value = object(await readJson(`${endpoint}/api/v1/camera/diagnostics`, { Accept: 'application/json' }, {
    signal: options.signal, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs,
  }));
  const camera = optionalObject(value.camera);
  const color = optionalObject(camera.color);
  const depth = optionalObject(camera.depth);
  const video = optionalObject(value.video);
  const whep = optionalObject(value.whep);
  return {
    cameraStatus: text(camera.status),
    framesFresh: bool(camera.frames_fresh),
    colorFrames: finiteNumber(color.frames),
    colorFps: finiteNumber(color.fps),
    depthFrames: finiteNumber(depth.frames),
    depthFps: finiteNumber(depth.fps),
    pipelineReady: bool(video.pipeline_ready),
    whepAvailable: bool(whep.available),
  };
}

/** Fetches only selected Gateway observations; it never grants control or follows remote links. */
export async function readLingtuStatus(options: {
  endpoint: string; allowLocalHttp?: boolean; signal?: AbortSignal; fetchImpl?: typeof fetch;
  now?: () => number; timeoutMs?: number;
}): Promise<LingtuReadOnlySnapshot> {
  const endpoint = validateLingtuOrigin(options.endpoint, options.allowLocalHttp === true);
  const now = options.now ?? elapsedNow;
  const observedAt = now();
  if (!Number.isFinite(observedAt) || observedAt < 0) return invalid();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) throw new LingtuReadOnlyError('cancelled');
  options.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const payloads: Record<string, unknown>[] = [];
    for (const [path, version] of [
      ['/api/v1/app/bootstrap', 4], ['/api/v1/app/capabilities', 2],
      ['/api/v1/state', 4], ['/api/v1/readiness', 1],
    ] as const) {
      const value = object(await readJson(`${endpoint}${path}`, { Accept: 'application/json' }, {
        signal: controller.signal, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs,
      }));
      if (controller.signal.aborted) throw new LingtuReadOnlyError('cancelled');
      if (value.schema_version !== version || typeof value.ts !== 'number' || !Number.isFinite(value.ts) || value.ts < 0) return invalid();
      payloads.push(value);
    }
    const [bootstrap, capabilities, state, readiness] = payloads;
    const sources = [object(bootstrap.session), optionalObject(bootstrap.runtime_products), object(state.session), optionalObject(capabilities.runtime_products),
      optionalObject(readiness.product_contract), optionalObject(optionalObject(readiness.runtime).boundary)];
    const environment = identity('env', sources);
    if (environment !== null && environment !== 'real' && environment !== 'sim') return invalid();
    const localization = object(state.localization), navigation = object(state.navigation);
    if (localization.schema_version !== 1 || navigation.schema_version !== 3) return invalid();
    const control = optionalObject(navigation.control), motion = optionalObject(navigation.motion);
    const features = object(capabilities.features);
    const reasons = readiness.reasons;
    if (!Array.isArray(reasons) || reasons.some(reason => typeof reason !== 'string' || reason.length > 256)) return invalid();
    const snapshot: LingtuReadOnlySnapshot = {
      endpoint, observedAt, environment, product: identity('product', sources),
      productSessionId: identity('product_session_id', sources),
      robotModel: text(optionalObject(bootstrap.robot).model), robotOnline: null, motionAuthorized: false,
      localizationState: text(localization.state), localizationReady: bool(localization.ready),
      localizationPoseFresh: bool(localization.pose_fresh),
      controlAuthority: text(control.authority), resumeRequired: bool(control.resume_required),
      motionPermission: text(motion.permission), mapName: text(optionalObject(state.map).active),
      features: Object.fromEntries(Object.entries(features).map(([key, value]) => [key, requiredBool(value)])),
      readiness: { ready: requiredBool(readiness.ready), dataReady: requiredBool(readiness.data_ready),
        motionReady: requiredBool(readiness.motion_ready), nonMotionSafe: requiredBool(readiness.non_motion_safe), reasons: [...reasons] },
    };
    if (!isLingtuStatusFresh(snapshot, now())) return invalid();
    return snapshot;
  } catch (error) {
    if (error instanceof LingtuReadOnlyError) throw error;
    throw new LingtuReadOnlyError(error instanceof ConnectionCheckError ? error.code : 'unavailable');
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}

/** Reads the saved-map catalog and current localization without activating or editing a map. */
export async function readLingtuMaps(options: {
  endpoint: string; allowLocalHttp?: boolean; signal?: AbortSignal; fetchImpl?: typeof fetch;
  now?: () => number; timeoutMs?: number;
}): Promise<LingtuMapLibrary> {
  const endpoint = validateLingtuOrigin(options.endpoint, options.allowLocalHttp === true);
  const now = options.now ?? elapsedNow;
  const observedAt = now();
  if (!Number.isFinite(observedAt) || observedAt < 0) return invalid();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  if (options.signal?.aborted) throw new LingtuReadOnlyError('cancelled');
  options.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const payloads: Record<string, unknown>[] = [];
    for (const path of ['/api/v1/slam/maps', '/api/v1/localization/status']) {
      const value = object(await readJson(`${endpoint}${path}`, { Accept: 'application/json' }, {
        signal: controller.signal, fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs,
      }));
      if (controller.signal.aborted) throw new LingtuReadOnlyError('cancelled');
      if (value.schema_version !== 1 || value.ts != null && (typeof value.ts !== 'number' || !Number.isFinite(value.ts) || value.ts < 0)) return invalid();
      payloads.push(value);
    }
    const [catalog, localization] = payloads;
    if (!Array.isArray(catalog.maps) || typeof catalog.active !== 'string'
      || typeof catalog.ts !== 'number' || !Number.isFinite(catalog.ts)) return invalid();
    const sources = [optionalObject(catalog.session), optionalObject(localization.session), optionalObject(localization.runtime)];
    const env = identity('env', sources);
    if (env !== null && env !== 'real' && env !== 'sim') return invalid();
    identity('product', sources); identity('product_session_id', sources);
    const activeMapName = identity('active_map', [
      { active_map: catalog.active }, { active_map: localization.active_map },
    ]);
    const names = new Set<string>();
    const maps = catalog.maps.map(value => {
      const item = object(value), name = text(item.name);
      if (!name || names.has(name)) return invalid();
      names.add(name);
      const contentEpoch = item.content_epoch;
      if (contentEpoch != null && (typeof contentEpoch !== 'number' || !Number.isSafeInteger(contentEpoch) || contentEpoch < 0)) return invalid();
      // Current MapInfo declares neither a frame ID nor a point count.
      return { name, contentEpoch: contentEpoch == null ? null : contentEpoch as number, frameId: null, pointCount: null,
        hasPointCloud: bool(item.has_pcd), hasOccupancy: bool(item.has_occupancy), state: text(item.state) };
    });
    const ready = bool(localization.ready), poseFresh = bool(localization.pose_fresh);
    const odometry = optionalObject(localization.odometry);
    const coordinates = ['x', 'y', 'z', 'yaw'].map(key => {
      const value = odometry[key];
      if (value != null && (typeof value !== 'number' || !Number.isFinite(value))) return invalid();
      return value == null ? null : value as number;
    });
    const currentPose = ready === true && poseFresh === true && bool(localization.has_odometry) === true
      && coordinates[0] !== null && coordinates[1] !== null && coordinates[3] !== null;
    const snapshot: LingtuMapLibrary = { endpoint, observedAt, activeMapName, maps, motionAuthorized: false,
      localization: { state: text(localization.state), ready, poseFresh, frameId: text(odometry.frame_id),
        x: currentPose ? coordinates[0] : null, y: currentPose ? coordinates[1] : null,
        z: currentPose ? coordinates[2] : null, yaw: currentPose ? coordinates[3] : null } };
    if (!isLingtuStatusFresh(snapshot, now())) return invalid();
    return snapshot;
  } catch (error) {
    if (error instanceof LingtuReadOnlyError) throw error;
    throw new LingtuReadOnlyError(error instanceof ConnectionCheckError ? error.code : 'unavailable');
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    controller.abort();
  }
}
