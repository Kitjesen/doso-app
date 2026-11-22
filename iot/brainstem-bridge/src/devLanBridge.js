import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import grpc from '@grpc/grpc-js';
import {
  CMS_STATE_KIND_NAMES,
  CMS_TRANSITION_KIND_NAMES,
  CONTROL_OWNER_NAMES,
  DEFAULT_CONTRACTS_ROOT,
  MAX_LINEAR_MPS,
  MAX_MESSAGE_BYTES,
  MAX_YAW_RPS,
  RECOVERY_PHASE_NAMES,
  RECOVERY_REASON_NAMES,
  loadBrainstemContractServices,
  validateLanEndpoint,
} from './brainstemContractProto.js';

const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:8083',
  'http://127.0.0.1:8083',
  'http://localhost:19006',
  'http://127.0.0.1:19006',
]);
const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const MAX_JSON_BODY_BYTES = 16 * 1024;
const MODE_LABELS = Object.freeze({
  flat: '平地模式',
  stairs: '楼梯模式',
  platform: '高台模式',
  high_platform: '高台模式',
  height: '身高控制',
  recovery: '摔倒恢复',
});
const MODE_KINDS = Object.freeze(['unspecified', 'locomotion', 'recovery-action', 'body-height']);
const MODE_AVAILABILITIES = Object.freeze(['unknown', 'unavailable', 'available']);

class BridgeFailure extends Error {
  constructor(code, httpStatus = 400) {
    super(code);
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

function buildAllowedOrigins(explicitOrigins) {
  const configured = explicitOrigins ?? [
    ...DEFAULT_ALLOWED_ORIGINS,
    ...(process.env.DOSO_WEB_DEV_ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  ];
  return new Set(configured);
}

function enumIndex(value, names, prefix) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < names.length) return value;
  if (typeof value === 'string') {
    const byUpper = names.findIndex((item) => `${prefix}${item.toUpperCase()}` === value);
    if (byUpper >= 0) return byUpper;
    const byName = names.indexOf(value);
    if (byName >= 0) return byName;
  }
  return null;
}

function safeText(value, maxLength) {
  if (typeof value !== 'string' || value.length > maxLength || value.includes('\0')) {
    throw new BridgeFailure('invalid_response', 502);
  }
  return value;
}

function safeFinite(value, min = -Infinity, max = Infinity) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new BridgeFailure('invalid_response', 502);
  }
  return value;
}

function parseNonNegSequence(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) throw new BridgeFailure('invalid_response', 502);
    return value;
  }
  if (typeof value === 'string' && /^[0-9]+$/.test(value)) {
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new BridgeFailure('invalid_response', 502);
    return parsed;
  }
  throw new BridgeFailure('invalid_response', 502);
}

function projectRawStatus(raw) {
  if (!raw || typeof raw !== 'object') throw new BridgeFailure('invalid_response', 502);
  const fsm = raw.fsm ?? {};
  const kindIdx = enumIndex(fsm.kind ?? 0, CMS_STATE_KIND_NAMES, 'CMS_STATE_KIND_');
  const transIdx = enumIndex(fsm.transition ?? 0, CMS_TRANSITION_KIND_NAMES, 'CMS_TRANSITION_KIND_');
  const ownerIdx = enumIndex(raw.owner ?? 0, CONTROL_OWNER_NAMES, 'CONTROL_OWNER_');
  if (kindIdx === null || transIdx === null || ownerIdx === null) throw new BridgeFailure('invalid_response', 502);
  for (const key of ['motorOutputEnabled', 'criticalMotorFault', 'grpcLeaseActive', 'readyForWalk']) {
    if (typeof raw[key] !== 'boolean') throw new BridgeFailure('invalid_response', 502);
  }
  const lastAcceptedSequence = parseNonNegSequence(raw.lastAcceptedSequence ?? '0');
  const ownerId = typeof raw.ownerId === 'string' && !raw.ownerId.includes('\0') ? raw.ownerId : '';
  return {
    status: {
      fsmKind: CMS_STATE_KIND_NAMES[kindIdx],
      transition: CMS_TRANSITION_KIND_NAMES[transIdx],
      motorOutputEnabled: raw.motorOutputEnabled,
      owner: CONTROL_OWNER_NAMES[ownerIdx],
      criticalMotorFault: raw.criticalMotorFault,
      grpcLeaseActive: raw.grpcLeaseActive,
      readyForWalk: raw.readyForWalk,
    },
    ownerId,
    lastAcceptedSequence,
  };
}

function resolveModeKind(rawKind) {
  if (typeof rawKind === 'number') {
    if (!Number.isInteger(rawKind) || rawKind < 0 || rawKind > 255) return null;
    return rawKind === 1 ? MODE_KINDS[1] : rawKind === 2 ? MODE_KINDS[2] : rawKind === 3 ? MODE_KINDS[3] : MODE_KINDS[0];
  }
  if (typeof rawKind === 'string') {
    if (rawKind === 'ROBOT_MODE_KIND_LOCOMOTION_PROFILE' || rawKind === 'locomotion') return MODE_KINDS[1];
    if (rawKind === 'ROBOT_MODE_KIND_RECOVERY_ACTION' || rawKind === 'recovery-action') return MODE_KINDS[2];
    if (rawKind === 'ROBOT_MODE_KIND_BODY_HEIGHT' || rawKind === 'body-height') return MODE_KINDS[3];
    if (rawKind === 'ROBOT_MODE_KIND_UNKNOWN' || rawKind === 'unspecified') return MODE_KINDS[0];
    if (/^ROBOT_MODE_KIND_[A-Z0-9_]+$/.test(rawKind)) return MODE_KINDS[0];
  }
  return null;
}

function projectProfile(raw) {
  if (!raw || typeof raw !== 'object') throw new BridgeFailure('invalid_response', 502);
  if (!Array.isArray(raw.available) || !Array.isArray(raw.descriptions) || raw.available.length > 64 || raw.descriptions.length > 64) {
    throw new BridgeFailure('invalid_response', 502);
  }
  const available = raw.available.map((item) => safeText(item, 128));
  const descriptions = raw.descriptions.map((item) => safeText(item, 512));
  const result = {
    current: safeText(raw.current ?? '', 128),
    available,
    descriptions,
    currentDescription: safeText(raw.currentDescription ?? '', 512),
  };
  if (typeof raw.activeModeId === 'string' && raw.activeModeId.length <= 64 && !raw.activeModeId.includes('\0')) {
    if (raw.activeModeId.length > 0) result.activeModeId = raw.activeModeId;
  }
  if (Array.isArray(raw.modeCapabilities) && raw.modeCapabilities.length > 0) {
    if (raw.modeCapabilities.length > 16) throw new BridgeFailure('invalid_response', 502);
    result.modeCapabilities = raw.modeCapabilities.map((item) => {
      if (!item || typeof item !== 'object') throw new BridgeFailure('invalid_response', 502);
      const id = safeText(item.id ?? '', 64);
      const kind = resolveModeKind(item.kind ?? 0);
      const availIdx = enumIndex(item.availability ?? 0, MODE_AVAILABILITIES, 'ROBOT_MODE_AVAILABILITY_');
      if (kind === null || availIdx === null) throw new BridgeFailure('invalid_response', 502);
      const availability = MODE_AVAILABILITIES[availIdx];
      return {
        id,
        kind,
        availability,
        label: MODE_LABELS[id] ?? id,
        profileId: safeText(item.profileId ?? '', 128),
        available: availability === 'available',
        unavailableReason: safeText(item.unavailableReason ?? '', 200),
      };
    });
  }
  return result;
}

function projectVoltage(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.values) || raw.values.length > 32) {
    throw new BridgeFailure('invalid_response', 502);
  }
  return { values: raw.values.map((v) => safeFinite(v, 0, 1000)) };
}

function projectMotors(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.motors) || raw.motors.length > 32) {
    throw new BridgeFailure('invalid_response', 502);
  }
  const seen = new Set();
  const motors = raw.motors.map((item) => {
    if (!item || typeof item !== 'object') throw new BridgeFailure('invalid_response', 502);
    const id = safeFinite(item.id, 0, 255);
    if (!Number.isInteger(id) || seen.has(id) || typeof item.online !== 'boolean' || !Array.isArray(item.errors) || item.errors.length > 64) {
      throw new BridgeFailure('invalid_response', 502);
    }
    seen.add(id);
    return {
      id,
      online: item.online,
      statusCode: safeFinite(item.statusCode, 0, 0xffffffff),
      temperatureC: safeFinite(item.temperature, -100, 300),
      voltageV: safeFinite(item.voltage, 0, 1000),
      positionRad: safeFinite(item.position, -1000, 1000),
      velocityRps: safeFinite(item.velocity, -10000, 10000),
      torqueNm: safeFinite(item.torque, -10000, 10000),
      errors: item.errors.map((code) => {
        const num = safeFinite(code, 0, 0xffffffff);
        if (!Number.isInteger(num)) throw new BridgeFailure('invalid_response', 502);
        return num;
      }),
    };
  });
  return { motors };
}

function projectImu(raw) {
  if (!raw || typeof raw !== 'object' || !raw.gyroscope || !raw.quaternion) return null;
  const g = raw.gyroscope;
  const q = raw.quaternion;
  if (![g.x, g.y, g.z].every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1000)) return null;
  if (![q.w, q.x, q.y, q.z].every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 2)) return null;
  const projected = {
    gyroX: g.x, gyroY: g.y, gyroZ: g.z,
    quatW: q.w, quatX: q.x, quatY: q.y, quatZ: q.z,
  };
  if (raw.linearAcceleration && typeof raw.linearAcceleration === 'object') {
    const a = raw.linearAcceleration;
    if ([a.x, a.y, a.z].every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1000)) {
      projected.accelX = a.x;
      projected.accelY = a.y;
      projected.accelZ = a.z;
    }
  }
  if (raw.timestamp && typeof raw.timestamp === 'object') {
    const seconds = Number(raw.timestamp.seconds ?? 0);
    const nanos = Number(raw.timestamp.nanos ?? 0);
    if (Number.isFinite(seconds) && seconds >= 0 && Number.isFinite(nanos) && nanos >= 0) {
      projected.timestampMs = Math.floor(seconds * 1000 + nanos / 1_000_000);
    }
  }
  return projected;
}

function projectRecovery(raw, heartbeatState) {
  if (!raw || typeof raw !== 'object') throw new BridgeFailure('invalid_response', 502);
  const phaseIdx = enumIndex(raw.phase ?? 0, RECOVERY_PHASE_NAMES, 'RECOVERY_PHASE_');
  const reasonIdx = enumIndex(raw.reason ?? 0, RECOVERY_REASON_NAMES, 'RECOVERY_REJECT_');
  if (phaseIdx === null || reasonIdx === null) throw new BridgeFailure('invalid_response', 502);
  for (const key of ['sessionSelected', 'modelConfigured', 'enableSequenceVerified', 'stableStand', 'locomotionAvailable']) {
    if (typeof raw[key] !== 'boolean') throw new BridgeFailure('invalid_response', 502);
  }
  return {
    phase: RECOVERY_PHASE_NAMES[phaseIdx],
    sessionSelected: raw.sessionSelected,
    modelConfigured: raw.modelConfigured,
    enableSequenceVerified: raw.enableSequenceVerified,
    stableStand: raw.stableStand,
    locomotionAvailable: raw.locomotionAvailable,
    activeModeId: safeText(raw.activeModeId ?? '', 64),
    reason: RECOVERY_REASON_NAMES[reasonIdx],
    detail: safeText(raw.detail ?? '', 200),
    ...(heartbeatState ? {
      ...(heartbeatState.heartbeatFresh !== null ? { heartbeatFresh: heartbeatState.heartbeatFresh } : {}),
      heartbeatError: heartbeatState.heartbeatError,
    } : {}),
  };
}

function mapGrpcErrorToCode(error, { deadlineCode = 'timeout', invalidArgCode = 'invalid_response' } = {}) {
  if (error instanceof BridgeFailure) return error.code;
  const status = error?.code;
  if (status === grpc.status.DEADLINE_EXCEEDED) return deadlineCode;
  if (status === grpc.status.CANCELLED) return 'cancelled';
  if (status === grpc.status.PERMISSION_DENIED || status === grpc.status.UNAUTHENTICATED) return 'unauthorized';
  if (status === grpc.status.FAILED_PRECONDITION) return 'precondition';
  if (status === grpc.status.INVALID_ARGUMENT) return invalidArgCode;
  if (status === grpc.status.UNIMPLEMENTED) return 'unimplemented';
  return 'unavailable';
}

function callGrpcUnary(client, methodName, payload, { deadlineMs, principal = null, signal = null } = {}) {
  return new Promise((resolve, reject) => {
    const metadata = new grpc.Metadata();
    if (principal) metadata.set('x-doso-dev-client', principal);
    const rpcMethod = `${methodName[0].toLowerCase()}${methodName.slice(1)}`;
    let settled = false;
    let call = null;
    const onAbort = () => {
      try { call?.cancel(); } catch { /* Ignore abort race. */ }
      if (!settled) {
        settled = true;
        reject(new BridgeFailure('cancelled', 499));
      }
    };
    if (signal?.aborted) {
      reject(new BridgeFailure('cancelled', 499));
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    call = client[rpcMethod](
      payload ?? {},
      metadata,
      { deadline: new Date(Date.now() + deadlineMs) },
      (error, value) => {
        signal?.removeEventListener('abort', onAbort);
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolve(value);
      },
    );
  });
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_JSON_BODY_BYTES) {
        reject(new BridgeFailure('config', 413));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const text = Buffer.concat(chunks, size).toString('utf8');
        const parsed = text.length ? JSON.parse(text) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new BridgeFailure('config', 400));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new BridgeFailure('config', 400));
      }
    });
    request.on('error', () => reject(new BridgeFailure('unavailable', 400)));
  });
}

function writeJson(response, statusCode, body) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

/**
 * Loopback-only HTTP/SSE <-> plaintext LAN gRPC dev bridge for Expo Web (`__DEV__`).
 * Supports 127.0.0.1 and RFC1918 IPv4 endpoints with lan-dev semantics matching ControlSession.kt.
 */
export async function createDevLanBridge({
  protoRoot = DEFAULT_CONTRACTS_ROOT,
  listenHost = '127.0.0.1',
  listenPort = 8121,
  allowedOrigins,
  readDeadlineMs = 3_000,
  controlOpenDeadlineMs = 3_000,
  actionDeadlineMs = 3_000,
  motionDeadlineMs = 250,
  minWireIntervalMs = 20,
  deadmanTimeoutMs = 250,
} = {}) {
  if (listenHost !== '127.0.0.1') {
    throw new Error('Web dev LAN bridge may only bind to loopback 127.0.0.1');
  }
  if (!Number.isInteger(listenPort) || listenPort < 0 || listenPort > 65535) {
    throw new Error('Invalid dev LAN bridge listenPort');
  }

  const origins = buildAllowedOrigins(allowedOrigins);
  const { RobotControl, RobotRecovery } = await loadBrainstemContractServices(protoRoot);
  const channelOptions = {
    'grpc.enable_http_proxy': 0,
    'grpc.max_receive_message_length': MAX_MESSAGE_BYTES,
    'grpc.max_send_message_length': MAX_MESSAGE_BYTES,
  };
  const readClients = new Map();
  let currentSession = null;
  let closed = false;
  let server = null;

  function getReadClient(host, port) {
    const key = `${host}:${port}`;
    let entry = readClients.get(key);
    if (!entry) {
      entry = new RobotControl(`${host}:${port}`, grpc.credentials.createInsecure(), channelOptions);
      readClients.set(key, entry);
    }
    return entry;
  }

  function buildSessionEnvelope(session, statusProjection, extra = {}) {
    return {
      sessionId: session.id,
      transport: 'grpc-lan',
      status: statusProjection.status,
      leaseActive: session.armed && Boolean(session.token) && statusProjection.status.grpcLeaseActive,
      principalVerified: false,
      leaseOwnerMatched: session.leaseOwnerMatched && session.armed && statusProjection.status.owner === 'grpc' && statusProjection.ownerId === session.principal,
      ...extra,
    };
  }

  function clearSessionTimers(session) {
    if (session.renewTimer) clearInterval(session.renewTimer);
    if (session.deadmanTimer) clearInterval(session.deadmanTimer);
    if (session.recoveryTimer) clearInterval(session.recoveryTimer);
    session.renewTimer = null;
    session.deadmanTimer = null;
    session.recoveryTimer = null;
  }

  function stopImuStream(session) {
    session.imuGeneration += 1;
    try { session.imuCall?.cancel(); } catch { /* Ignore. */ }
    session.imuCall = null;
    for (const res of [...session.sseClients]) {
      try { res.end(); } catch { /* Ignore. */ }
    }
    session.sseClients.clear();
  }

  function haltSessionImmediately(session) {
    session.epoch += 1;
    session.armed = false;
    session.leaseOwnerMatched = false;
    session.motionIntent = false;
    session.stopping = true;
    session.activeCallAbort?.abort();
  }

  function enqueueSessionWork(session, fn) {
    const run = session.queue.then(() => fn());
    session.queue = run.catch(() => undefined);
    return run;
  }

  async function paceWireInterval(session) {
    const sinceLast = Date.now() - session.lastWireAt;
    if (session.lastWireAt > 0 && sinceLast < minWireIntervalMs) {
      await new Promise((resolve) => setTimeout(resolve, minWireIntervalMs - sinceLast));
    }
  }

  async function performInterrupt(session) {
    haltSessionImmediately(session);
    const held = session.token;
    let releaseConfirmed = !held && !session.stopUnconfirmed;
    let latestProjection = null;
    try {
      if (held && !session.closed) {
        if (session.sequenceCertain) {
          try {
            await paceWireInterval(session);
            const nextSeq = session.sequence + 1;
            const ack = await callGrpcUnary(session.controlClient, 'WalkChecked', {
              token: held,
              sequence: String(nextSeq),
              direction: { x: 0, y: 0, z: 0 },
            }, { deadlineMs: motionDeadlineMs, principal: session.principal });
            session.lastWireAt = Date.now();
            if (ack?.status) {
              const proj = projectRawStatus(ack.status);
              if (ack.accepted && Number(ack.sequence) === nextSeq) latestProjection = proj;
            }
          } catch { /* Proceed to ReleaseControl even if final zero timed out. */ }
        }
        try {
          const releasedRaw = await callGrpcUnary(session.controlClient, 'ReleaseControl', { token: held }, {
            deadlineMs: motionDeadlineMs,
            principal: session.principal,
          });
          const proj = projectRawStatus(releasedRaw);
          latestProjection = proj;
          if (!proj.status.grpcLeaseActive && (proj.status.owner !== 'grpc' || proj.ownerId !== session.principal)) {
            releaseConfirmed = true;
          }
        } catch { /* Release unconfirmed. */ }
      }
    } finally {
      clearSessionTimers(session);
      session.token = '';
      session.sequence = 0;
      session.sequenceCertain = true;
      session.leaseOwnerMatched = false;
      session.motionIntent = false;
      session.stopUnconfirmed = !releaseConfirmed;
      session.stopping = !releaseConfirmed;
    }
    if (!releaseConfirmed) throw new BridgeFailure('stop_unconfirmed', 502);
    if (!latestProjection) {
      const fresh = await callGrpcUnary(session.controlClient, 'GetControlStatus', {}, {
        deadlineMs: actionDeadlineMs,
        principal: session.principal,
      });
      latestProjection = projectRawStatus(fresh);
    }
    return buildSessionEnvelope(session, latestProjection, { leaseActive: false, leaseOwnerMatched: false });
  }

  function interruptSessionSerialized(session) {
    haltSessionImmediately(session);
    return enqueueSessionWork(session, () => performInterrupt(session));
  }

  function startLeaseWatchdogs(session) {
    if (session.renewTimer) clearInterval(session.renewTimer);
    if (session.deadmanTimer) clearInterval(session.deadmanTimer);
    const renewEveryMs = Math.max(50, Math.min(90, Math.floor(session.leaseDurationMs / 3)));
    session.renewTimer = setInterval(() => {
      if (session.closed || !session.armed || !session.token || session.rpcBusy) return;
      if (session.motionIntent && Date.now() - session.lastInputAt > deadmanTimeoutMs) return;
      void enqueueSessionWork(session, async () => {
        if (session.closed || !session.armed || !session.token) return;
        try {
          const reply = await callGrpcUnary(session.controlClient, 'RenewControlLease', { token: session.token }, {
            deadlineMs: motionDeadlineMs,
            principal: session.principal,
          });
          if (!reply?.accepted) {
            haltSessionImmediately(session);
            session.token = '';
            session.stopping = false;
            clearSessionTimers(session);
          }
        } catch { /* Watchdog/status read handles lease expiry fail-closed. */ }
      }).catch(() => undefined);
    }, renewEveryMs);
    session.renewTimer.unref?.();

    session.deadmanTimer = setInterval(() => {
      if (session.closed || !session.armed || !session.motionIntent) return;
      if (Date.now() - session.lastInputAt > deadmanTimeoutMs) {
        void interruptSessionSerialized(session).catch(() => undefined);
      }
    }, 25);
    session.deadmanTimer.unref?.();
  }

  function setRecoveryHeartbeat(session, enabled) {
    if (session.recoveryTimer) {
      clearInterval(session.recoveryTimer);
      session.recoveryTimer = null;
    }
    if (!enabled || session.closed) {
      session.heartbeatState = { heartbeatFresh: null, heartbeatError: null };
      return;
    }
    session.heartbeatState = { heartbeatFresh: false, heartbeatError: null };
    session.recoveryTimer = setInterval(() => {
      if (session.closed || session.recoveryHeartbeatInFlight) return;
      session.recoveryHeartbeatInFlight = true;
      void callGrpcUnary(session.recoveryClient, 'Heartbeat', {}, {
        deadlineMs: 200,
        principal: session.principal,
      }).then(() => {
        session.heartbeatState = { heartbeatFresh: true, heartbeatError: null };
      }).catch((error) => {
        const code = mapGrpcErrorToCode(error);
        session.heartbeatState = { heartbeatFresh: false, heartbeatError: code };
        if (code === 'unimplemented') setRecoveryHeartbeat(session, false);
      }).finally(() => {
        session.recoveryHeartbeatInFlight = false;
      });
    }, 100);
    session.recoveryTimer.unref?.();
  }

  async function destroySession(session) {
    if (!session || session.closed) return;
    if (currentSession === session) currentSession = null;
    clearSessionTimers(session);
    stopImuStream(session);
    try {
      if (session.token || session.stopUnconfirmed) {
        await interruptSessionSerialized(session);
      }
    } catch { /* Best effort release on session close. */ }
    session.closed = true;
    try { session.controlClient.close(); } catch { /* Ignore. */ }
    try { session.recoveryClient.close(); } catch { /* Ignore. */ }
  }

  function requireSession(sessionId) {
    if (!currentSession || currentSession.closed || typeof sessionId !== 'string' || currentSession.id !== sessionId) {
      throw new BridgeFailure('cancelled', 404);
    }
    return currentSession;
  }

  async function handleRead(body, requestAbortSignal) {
    const endpoint = validateLanEndpoint(body.host, body.port);
    if (!endpoint || typeof body.requestId !== 'string' || !REQUEST_ID_PATTERN.test(body.requestId)) {
      throw new BridgeFailure('config', 400);
    }
    if (!['status', 'profile', 'voltage', 'motors'].includes(body.kind)) {
      throw new BridgeFailure('config', 400);
    }
    if (currentSession && !currentSession.closed && (currentSession.host !== endpoint.host || currentSession.port !== endpoint.port)) {
      throw new BridgeFailure('busy', 409);
    }
    const client = getReadClient(endpoint.host, endpoint.port);
    const envelopeBase = {
      requestId: body.requestId,
      transport: 'grpc-lan',
      mutualTlsVerified: false,
      clientIdentitySelected: false,
    };
    try {
      if (body.kind === 'status') {
        const raw = await callGrpcUnary(client, 'GetControlStatus', {}, { deadlineMs: readDeadlineMs, signal: requestAbortSignal });
        return { ...envelopeBase, status: projectRawStatus(raw).status };
      }
      if (body.kind === 'profile') {
        const raw = await callGrpcUnary(client, 'GetProfile', {}, { deadlineMs: readDeadlineMs, signal: requestAbortSignal });
        return { ...envelopeBase, profile: projectProfile(raw) };
      }
      if (body.kind === 'voltage') {
        const raw = await callGrpcUnary(client, 'GetVoltage', {}, { deadlineMs: readDeadlineMs, signal: requestAbortSignal });
        return { ...envelopeBase, voltage: projectVoltage(raw) };
      }
      const raw = await callGrpcUnary(client, 'GetMotorStatus', {}, { deadlineMs: readDeadlineMs, signal: requestAbortSignal });
      return { ...envelopeBase, ...projectMotors(raw) };
    } catch (error) {
      throw new BridgeFailure(mapGrpcErrorToCode(error), 502);
    }
  }

  async function handleSessionOpen(body, requestAbortSignal) {
    const endpoint = validateLanEndpoint(body.host, body.port);
    if (!endpoint || typeof body.requestId !== 'string' || !REQUEST_ID_PATTERN.test(body.requestId)) {
      throw new BridgeFailure('config', 400);
    }
    if (currentSession) {
      await destroySession(currentSession);
    }
    const target = `${endpoint.host}:${endpoint.port}`;
    const principal = `lan-${randomBytes(16).toString('hex')}@dev`;
    const controlClient = new RobotControl(target, grpc.credentials.createInsecure(), channelOptions);
    const recoveryClient = new RobotRecovery(target, grpc.credentials.createInsecure(), channelOptions);
    const session = {
      id: randomUUID(),
      host: endpoint.host,
      port: endpoint.port,
      principal,
      controlClient,
      recoveryClient,
      queue: Promise.resolve(),
      rpcBusy: false,
      closed: false,
      armed: false,
      stopping: false,
      stopUnconfirmed: false,
      motionIntent: false,
      token: '',
      leaseDurationMs: 300,
      leaseOwnerMatched: false,
      sequence: 0,
      sequenceCertain: true,
      epoch: 0,
      lastWireAt: 0,
      lastInputAt: 0,
      profileReadAt: 0,
      renewTimer: null,
      deadmanTimer: null,
      recoveryTimer: null,
      recoveryHeartbeatInFlight: false,
      heartbeatState: null,
      activeCallAbort: null,
      imuGeneration: 0,
      imuCall: null,
      sseClients: new Set(),
    };

    try {
      const rawStatus = await callGrpcUnary(controlClient, 'GetControlStatus', {}, {
        deadlineMs: controlOpenDeadlineMs,
        principal,
        signal: requestAbortSignal,
      });
      const projected = projectRawStatus(rawStatus);
      let profile = null;
      let profileUnavailable = false;
      try {
        const rawProfile = await callGrpcUnary(controlClient, 'GetProfile', {}, {
          deadlineMs: 750,
          principal,
          signal: requestAbortSignal,
        });
        profile = projectProfile(rawProfile);
        session.profileReadAt = Date.now();
      } catch (profileError) {
        const code = mapGrpcErrorToCode(profileError);
        if (['unimplemented', 'precondition', 'unavailable', 'timeout', 'busy'].includes(code)) {
          profileUnavailable = true;
        } else {
          throw profileError;
        }
      }
      if (closed) throw new BridgeFailure('cancelled', 503);
      currentSession = session;
      return buildSessionEnvelope(session, projected, {
        requestId: body.requestId,
        mutualTlsVerified: false,
        clientIdentitySelected: false,
        sessionPrincipal: principal,
        leaseActive: false,
        leaseOwnerMatched: false,
        ...(profile ? { profile } : {}),
        ...(profileUnavailable ? { profileUnavailable: true } : {}),
      });
    } catch (error) {
      try { controlClient.close(); } catch { /* Ignore. */ }
      try { recoveryClient.close(); } catch { /* Ignore. */ }
      throw new BridgeFailure(mapGrpcErrorToCode(error), 502);
    }
  }

  async function handleSessionRead(session) {
    return enqueueSessionWork(session, async () => {
      if (session.closed) throw new BridgeFailure('cancelled', 404);
      session.rpcBusy = true;
      try {
        const rawStatus = await callGrpcUnary(session.controlClient, 'GetControlStatus', {}, {
          deadlineMs: actionDeadlineMs,
          principal: session.principal,
        });
        const projected = projectRawStatus(rawStatus);
        if (session.armed && (
          !projected.status.grpcLeaseActive || projected.status.owner !== 'grpc'
          || projected.status.criticalMotorFault || !projected.status.motorOutputEnabled
          || projected.ownerId !== session.principal || projected.lastAcceptedSequence !== session.sequence
        )) {
          haltSessionImmediately(session);
          clearSessionTimers(session);
          session.token = '';
          session.sequence = 0;
          session.sequenceCertain = true;
          session.stopping = false;
        }
        let profileExtra = {};
        if (!session.armed && Date.now() - session.profileReadAt >= 2_000) {
          session.profileReadAt = Date.now();
          try {
            const rawProfile = await callGrpcUnary(session.controlClient, 'GetProfile', {}, {
              deadlineMs: 750,
              principal: session.principal,
            });
            profileExtra = { profile: projectProfile(rawProfile) };
          } catch (profileError) {
            const code = mapGrpcErrorToCode(profileError);
            if (['unimplemented', 'precondition', 'unavailable', 'timeout', 'busy'].includes(code)) {
              profileExtra = { profileUnavailable: true };
            } else {
              throw profileError;
            }
          }
        }
        return buildSessionEnvelope(session, projected, {
          ...profileExtra,
          ...(session.armed && session.sequence > 0 ? { sequence: session.sequence } : {}),
        });
      } catch (error) {
        throw new BridgeFailure(mapGrpcErrorToCode(error), 502);
      } finally {
        session.rpcBusy = false;
      }
    });
  }

  async function handleSessionAcquire(session) {
    return enqueueSessionWork(session, async () => {
      if (session.closed) throw new BridgeFailure('cancelled', 404);
      if (session.armed || session.token || session.stopping) throw new BridgeFailure('busy', 409);
      session.rpcBusy = true;
      try {
        const before = projectRawStatus(await callGrpcUnary(session.controlClient, 'GetControlStatus', {}, {
          deadlineMs: actionDeadlineMs,
          principal: session.principal,
        }));
        if (!before.status.motorOutputEnabled || before.status.criticalMotorFault
          || before.status.owner === 'yunzhuo' || before.status.grpcLeaseActive
          || !['standing', 'walking'].includes(before.status.fsmKind)) {
          throw new BridgeFailure('precondition', 409);
        }
        const leaseRaw = await callGrpcUnary(session.controlClient, 'AcquireControl', { clientId: session.principal }, {
          deadlineMs: actionDeadlineMs,
          principal: session.principal,
        });
        if (!leaseRaw?.accepted || typeof leaseRaw.token !== 'string' || !leaseRaw.token) {
          throw new BridgeFailure(leaseRaw?.reason === 6 || leaseRaw?.reason === 9 ? 'busy' : 'precondition', 409);
        }
        const leaseStatus = projectRawStatus(leaseRaw.status);
        if (!leaseStatus.status.grpcLeaseActive || leaseStatus.status.owner !== 'grpc'
          || leaseStatus.ownerId !== session.principal || leaseStatus.lastAcceptedSequence !== 0) {
          throw new BridgeFailure('invalid_response', 502);
        }
        session.token = leaseRaw.token;
        session.leaseDurationMs = Number.isInteger(leaseRaw.leaseDurationMs) && leaseRaw.leaseDurationMs >= 200 ? leaseRaw.leaseDurationMs : 300;
        session.sequence = 0;
        session.sequenceCertain = true;
        session.lastWireAt = 0;
        session.lastInputAt = Date.now();
        session.stopping = false;
        session.motionIntent = false;
        session.armed = true;

        try {
          await paceWireInterval(session);
          const zeroAck = await callGrpcUnary(session.controlClient, 'WalkChecked', {
            token: session.token,
            sequence: '1',
            direction: { x: 0, y: 0, z: 0 },
          }, { deadlineMs: motionDeadlineMs, principal: session.principal });
          session.lastWireAt = Date.now();
          if (!zeroAck?.accepted || Number(zeroAck.sequence) !== 1 || Number(zeroAck.reason ?? 0) !== 0) {
            throw new BridgeFailure(Number(zeroAck?.sequence) !== 1 ? 'ack_mismatch' : 'command_rejected', 502);
          }
          const zeroStatus = projectRawStatus(zeroAck.status);
          if (!zeroStatus.status.grpcLeaseActive || zeroStatus.status.owner !== 'grpc'
            || zeroStatus.ownerId !== session.principal || zeroStatus.lastAcceptedSequence !== 1
            || !zeroStatus.status.motorOutputEnabled || zeroStatus.status.criticalMotorFault) {
            throw new BridgeFailure('command_rejected', 502);
          }
          session.sequence = 1;
          session.sequenceCertain = true;
          session.leaseOwnerMatched = true;
          session.lastInputAt = Date.now();
          startLeaseWatchdogs(session);
          return buildSessionEnvelope(session, zeroStatus, {
            leaseActive: true,
            principalVerified: false,
            leaseOwnerMatched: true,
            sequence: 1,
          });
        } catch (zeroError) {
          await performInterrupt(session).catch(() => undefined);
          throw zeroError;
        }
      } catch (error) {
        throw new BridgeFailure(mapGrpcErrorToCode(error), error?.httpStatus ?? 502);
      } finally {
        session.rpcBusy = false;
      }
    });
  }

  async function handleSessionInput(session, body) {
    const x = Number(body.forward);
    const y = Number(body.lateral);
    const z = Number(body.yaw);
    if (![x, y, z].every(Number.isFinite) || Math.abs(x) > MAX_LINEAR_MPS || Math.abs(y) > MAX_LINEAR_MPS || Math.abs(z) > MAX_YAW_RPS) {
      throw new BridgeFailure('config', 400);
    }
    const capturedEpoch = session.epoch;
    return enqueueSessionWork(session, async () => {
      if (session.closed || session.epoch !== capturedEpoch) throw new BridgeFailure('cancelled', 409);
      if (!session.armed || session.stopping || !session.token) throw new BridgeFailure('not_armed', 409);
      session.rpcBusy = true;
      try {
        await paceWireInterval(session);
        if (session.closed || session.epoch !== capturedEpoch || !session.armed || session.stopping || !session.token) {
          throw new BridgeFailure('cancelled', 409);
        }
        const nextSequence = session.sequence + 1;
        if (!Number.isSafeInteger(nextSequence) || nextSequence <= 0) throw new BridgeFailure('invalid_response', 502);
        const nonZero = x !== 0 || y !== 0 || z !== 0;
        if (nonZero) session.motionIntent = true;
        session.lastInputAt = Date.now();
        session.sequenceCertain = false;
        const callAbort = new AbortController();
        session.activeCallAbort = callAbort;
        let ack;
        try {
          ack = await callGrpcUnary(session.controlClient, 'WalkChecked', {
            token: session.token,
            sequence: String(nextSequence),
            direction: { x, y, z },
          }, { deadlineMs: motionDeadlineMs, principal: session.principal, signal: callAbort.signal });
        } finally {
          if (session.activeCallAbort === callAbort) session.activeCallAbort = null;
        }
        session.lastWireAt = Date.now();
        const ackStatus = projectRawStatus(ack?.status);
        if (!ack?.accepted || Number(ack.reason ?? 0) !== 0) {
          throw new BridgeFailure('command_rejected', 502);
        }
        if (Number(ack.sequence) !== nextSequence || ackStatus.lastAcceptedSequence !== nextSequence) {
          throw new BridgeFailure('ack_mismatch', 502);
        }
        if (!ackStatus.status.grpcLeaseActive || ackStatus.status.owner !== 'grpc'
          || ackStatus.ownerId !== session.principal || ackStatus.status.criticalMotorFault
          || !ackStatus.status.motorOutputEnabled) {
          throw new BridgeFailure('command_rejected', 502);
        }
        session.sequence = nextSequence;
        session.sequenceCertain = true;
        session.leaseOwnerMatched = true;
        session.lastInputAt = Date.now();
        if (!nonZero) session.motionIntent = false;
        return buildSessionEnvelope(session, ackStatus, {
          leaseActive: true,
          principalVerified: false,
          leaseOwnerMatched: true,
          sequence: nextSequence,
        });
      } catch (error) {
        await performInterrupt(session).catch(() => undefined);
        throw new BridgeFailure(mapGrpcErrorToCode(error), error?.httpStatus ?? 502);
      } finally {
        session.rpcBusy = false;
      }
    });
  }

  async function handleSessionAction(session, body) {
    const action = body.action;
    const profileName = body.profileName ?? null;
    if (!['enable', 'disable', 'stand-up', 'sit-down', 'switch-profile', 'set-zero', 'clear-motor-fault', 'play-gesture'].includes(action)) {
      throw new BridgeFailure('config', 400);
    }
    const methodByAction = {
      enable: 'Enable',
      disable: 'Disable',
      'stand-up': 'StandUp',
      'sit-down': 'SitDown',
      'switch-profile': 'SwitchProfile',
      'set-zero': 'SetZero',
      'clear-motor-fault': 'ClearMotorFault',
      'play-gesture': 'PlayGesture',
    };
    const gestureName = typeof body.gestureName === 'string' ? body.gestureName.trim() : '';
    if (action === 'play-gesture' && (!gestureName || gestureName.length > 64)) throw new BridgeFailure('config', 400);
    const jointIds = body.jointIds ?? [];
    if (action === 'clear-motor-fault'
      && (!Array.isArray(jointIds) || jointIds.length > 16 || !jointIds.every((id) => Number.isInteger(id) && id >= 0 && id < 16))) {
      throw new BridgeFailure('config', 400);
    }
    const capturedEpoch = session.epoch;
    return enqueueSessionWork(session, async () => {
      if (session.closed || session.epoch !== capturedEpoch) throw new BridgeFailure('cancelled', 409);
      if (session.stopping) throw new BridgeFailure('busy', 409);
      session.rpcBusy = true;
      try {
        if (session.token || session.stopUnconfirmed) {
          await performInterrupt(session);
        }
        session.stopping = false;
        const before = projectRawStatus(await callGrpcUnary(session.controlClient, 'GetControlStatus', {}, {
          deadlineMs: actionDeadlineMs,
          principal: session.principal,
        }));
        if (action !== 'disable') {
          if (before.status.owner === 'yunzhuo' || (before.status.criticalMotorFault && action !== 'clear-motor-fault') || before.status.fsmKind === 'transitioning') {
            throw new BridgeFailure('precondition', 409);
          }
          if ((action === 'stand-up' || action === 'sit-down') && !before.status.motorOutputEnabled) {
            throw new BridgeFailure('precondition', 409);
          }
          if (action === 'stand-up' && before.status.fsmKind === 'walking' && before.status.grpcLeaseActive) {
            throw new BridgeFailure('precondition', 409);
          }
          if (action === 'set-zero' && (before.status.fsmKind !== 'grounded' || before.status.grpcLeaseActive)) {
            throw new BridgeFailure('precondition', 409);
          }
          if (action === 'play-gesture' && (before.status.fsmKind !== 'standing' || !before.status.motorOutputEnabled || before.status.grpcLeaseActive)) {
            throw new BridgeFailure('precondition', 409);
          }
        }
        let motionSlotRequest = false;
        let payload = {};
        if (action === 'play-gesture') payload = { name: gestureName };
        if (action === 'clear-motor-fault') payload = { jointIds };
        if (action === 'switch-profile') {
          if (!['grounded', 'standing'].includes(before.status.fsmKind) || before.status.grpcLeaseActive) {
            throw new BridgeFailure('precondition', 409);
          }
          if (typeof profileName !== 'string' || !profileName.trim() || profileName.length > 256) {
            throw new BridgeFailure('config', 400);
          }
          const profile = projectProfile(await callGrpcUnary(session.controlClient, 'GetProfile', {}, {
            deadlineMs: actionDeadlineMs,
            principal: session.principal,
          }));
          const capabilities = profile.modeCapabilities ?? [];
          motionSlotRequest = capabilities.some((item) => item.kind === 'locomotion');
          if (motionSlotRequest) {
            const matches = capabilities.filter((item) => item.id === profileName);
            const selected = matches.length === 1 ? matches[0] : null;
            if (!selected || selected.kind !== 'locomotion' || !selected.available || selected.availability !== 'available') {
              throw new BridgeFailure('precondition', 409);
            }
          } else if (!profile.available.includes(profileName)) {
            throw new BridgeFailure('precondition', 409);
          }
          payload = { name: profileName };
        }
        const response = await callGrpcUnary(session.controlClient, methodByAction[action], payload, {
          deadlineMs: actionDeadlineMs,
          principal: session.principal,
        });
        const statusProj = projectRawStatus(await callGrpcUnary(session.controlClient, 'GetControlStatus', {}, {
          deadlineMs: actionDeadlineMs,
          principal: session.principal,
        }));
        let extra = {};
        if (action === 'switch-profile') {
          const updatedProfile = projectProfile(response);
          if (motionSlotRequest ? updatedProfile.activeModeId !== profileName : updatedProfile.current !== profileName) {
            throw new BridgeFailure('invalid_response', 502);
          }
          extra = { profile: updatedProfile };
        }
        return buildSessionEnvelope(session, statusProj, {
          leaseActive: false,
          leaseOwnerMatched: false,
          ...extra,
        });
      } catch (error) {
        throw new BridgeFailure(mapGrpcErrorToCode(error, { invalidArgCode: 'precondition' }), error?.httpStatus ?? 502);
      } finally {
        session.rpcBusy = false;
      }
    });
  }

  async function handleSessionRecovery(session, body) {
    const command = body.command;
    const rpcByCommand = {
      status: 'GetStatus',
      enter: 'Enter',
      enable: 'Enable',
      start: 'Start',
      cancel: 'Cancel',
      exit: 'Exit',
    };
    const methodName = rpcByCommand[command];
    if (!methodName) throw new BridgeFailure('config', 400);
    return enqueueSessionWork(session, async () => {
      if (session.closed) throw new BridgeFailure('cancelled', 404);
      try {
        const raw = await callGrpcUnary(session.recoveryClient, methodName, {}, {
          deadlineMs: actionDeadlineMs,
          principal: session.principal,
        });
        return projectRecovery(raw, session.heartbeatState);
      } catch (error) {
        throw new BridgeFailure(mapGrpcErrorToCode(error), 502);
      }
    });
  }

  function handleImuStream(session, request, response) {
    stopImuStream(session);
    request.setTimeout?.(0);
    response.setTimeout?.(0);
    const generation = session.imuGeneration;
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.flushHeaders?.();
    response.write(': ok\n\n');
    session.sseClients.add(response);

    const metadata = new grpc.Metadata();
    metadata.set('x-doso-dev-client', session.principal);
    const call = session.controlClient.listenImu({}, metadata);
    session.imuCall = call;
    let lastEmitAt = 0;

    call.on('data', (sample) => {
      if (session.closed || session.imuGeneration !== generation) return;
      const now = Date.now();
      if (now - lastEmitAt < 100) return;
      const projected = projectImu(sample);
      if (!projected) return;
      lastEmitAt = now;
      if (!response.destroyed && !response.writableEnded) {
        response.write(`data: ${JSON.stringify(projected)}\n\n`);
      }
    });
    call.on('error', () => {
      if (session.imuGeneration === generation && !response.destroyed && !response.writableEnded) {
        response.end();
      }
    });
    call.on('end', () => {
      if (session.imuGeneration === generation && !response.destroyed && !response.writableEnded) {
        response.end();
      }
    });

    request.on('close', () => {
      session.sseClients.delete(response);
      if (session.imuGeneration === generation) {
        session.imuGeneration += 1;
        try { call.cancel(); } catch { /* Ignore. */ }
        if (session.imuCall === call) session.imuCall = null;
      }
    });
  }

  function validateHostHeader(request) {
    const address = server?.address();
    const port = typeof address === 'object' && address ? address.port : listenPort;
    const hostHeader = request.headers.host;
    return hostHeader === `127.0.0.1:${port}` || hostHeader === `localhost:${port}`;
  }

  function applyCorsHeaders(request, response) {
    const origin = request.headers.origin;
    if (origin === undefined) return;
    if (typeof origin !== 'string' || !origins.has(origin)) {
      throw new BridgeFailure('unauthorized', 403);
    }
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Vary', 'Origin');
  }

  function requireJsonContentType(request) {
    const raw = request.headers['content-type'];
    if (typeof raw !== 'string') throw new BridgeFailure('config', 415);
    const media = raw.split(';')[0]?.trim().toLowerCase();
    if (media !== 'application/json') throw new BridgeFailure('config', 415);
  }

  const handler = async (request, response) => {
    try {
      if (!validateHostHeader(request)) throw new BridgeFailure('unauthorized', 403);
      applyCorsHeaders(request, response);
      if (request.method === 'OPTIONS') {
        const origin = request.headers.origin;
        const requestedMethod = request.headers['access-control-request-method'];
        const requestedHeaders = request.headers['access-control-request-headers'];
        const validHeaderList = requestedHeaders === undefined || (
          typeof requestedHeaders === 'string'
          && requestedHeaders.length <= 512
          && /^[A-Za-z0-9_,\s-]+$/.test(requestedHeaders)
        );
        if (typeof origin !== 'string' || !origins.has(origin)
          || !['GET', 'POST'].includes(String(requestedMethod))
          || !validHeaderList) {
          throw new BridgeFailure('unauthorized', 403);
        }
        if (request.headers['access-control-request-private-network'] === 'true') {
          response.setHeader('Access-Control-Allow-Private-Network', 'true');
        }
        const safeHeaders = requestedHeaders
          ? requestedHeaders.split(',').map((item) => item.trim()).filter(Boolean)
          : [];
        const allowHeaders = Array.from(new Set(['Content-Type', 'Accept', 'Cache-Control', ...safeHeaders])).join(', ');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', allowHeaders);
        response.statusCode = 204;
        response.end();
        return;
      }

      const url = new URL(request.url ?? '/', 'http://bridge.invalid');
      if (url.search) throw new BridgeFailure('config', 400);

      if (request.method === 'GET' && url.pathname === '/api/v1/dev-lan/health') {
        writeJson(response, 200, {
          ok: true,
          service: 'doso-web-dev-lan-bridge',
          simulation: false,
          activeSession: Boolean(currentSession && !currentSession.closed),
        });
        return;
      }

      const imuMatch = /^\/api\/v1\/dev-lan\/session\/([A-Za-z0-9-]+)\/imu$/.exec(url.pathname);
      if (request.method === 'GET' && imuMatch) {
        const session = requireSession(imuMatch[1]);
        handleImuStream(session, request, response);
        return;
      }

      if (request.method !== 'POST') {
        throw new BridgeFailure('config', 404);
      }

      requireJsonContentType(request);
      const body = await readJsonBody(request);
      const abortController = new AbortController();
      const abortOnClose = () => abortController.abort();
      request.once('aborted', abortOnClose);
      response.once('close', () => {
        if (!response.writableFinished) abortController.abort();
      });

      let data;
      if (url.pathname === '/api/v1/dev-lan/read') {
        data = await handleRead(body, abortController.signal);
      } else if (url.pathname === '/api/v1/dev-lan/session/open') {
        data = await handleSessionOpen(body, abortController.signal);
      } else if (url.pathname === '/api/v1/dev-lan/session/read') {
        data = await handleSessionRead(requireSession(body.sessionId));
      } else if (url.pathname === '/api/v1/dev-lan/session/acquire') {
        data = await handleSessionAcquire(requireSession(body.sessionId));
      } else if (url.pathname === '/api/v1/dev-lan/session/input') {
        data = await handleSessionInput(requireSession(body.sessionId), body);
      } else if (url.pathname === '/api/v1/dev-lan/session/action') {
        data = await handleSessionAction(requireSession(body.sessionId), body);
      } else if (url.pathname === '/api/v1/dev-lan/session/speed-mode') {
        const session = requireSession(body.sessionId);
        if (body.action === 'get') {
          let raw;
          try {
            raw = await callGrpcUnary(session.controlClient, 'GetSpeedMode', {}, {
              deadlineMs: readDeadlineMs,
              principal: session.principal,
              signal: abortController.signal,
            });
          } catch (error) {
            throw new BridgeFailure(mapGrpcErrorToCode(error), 502);
          }
          const rawMode = raw?.mode;
          data = {
            speedMode: rawMode === 1 || rawMode === 'SPEED_MODE_HIGH' ? 'high' : 'normal',
          };
        } else if (body.action === 'set') {
          const targetMode = typeof body.mode === 'string' ? body.mode.trim().toLowerCase() : '';
          if (targetMode !== 'normal' && targetMode !== 'high') {
            throw new BridgeFailure('config', 400);
          }
          data = await enqueueSessionWork(session, async () => {
            if (session.closed) throw new BridgeFailure('cancelled', 404);
            session.rpcBusy = true;
            try {
              if (session.token || session.stopUnconfirmed) {
                await performInterrupt(session);
              }
              session.stopping = false;
              const before = projectRawStatus(await callGrpcUnary(session.controlClient, 'GetControlStatus', {}, {
                deadlineMs: actionDeadlineMs,
                principal: session.principal,
              }));
              if (before.status.owner === 'yunzhuo' || before.status.criticalMotorFault || before.status.fsmKind === 'transitioning') {
                throw new BridgeFailure('precondition', 409);
              }
              await callGrpcUnary(session.controlClient, 'SetSpeedMode', { mode: targetMode === 'high' ? 1 : 0 }, {
                deadlineMs: actionDeadlineMs,
                principal: session.principal,
              });
              const statusProj = projectRawStatus(await callGrpcUnary(session.controlClient, 'GetControlStatus', {}, {
                deadlineMs: actionDeadlineMs,
                principal: session.principal,
              }));
              return {
                ...buildSessionEnvelope(session, statusProj, { leaseActive: false, leaseOwnerMatched: false }),
                speedMode: targetMode,
              };
            } catch (error) {
              if (error instanceof BridgeFailure) throw error;
              throw new BridgeFailure(mapGrpcErrorToCode(error, { invalidArgCode: 'precondition' }), 502);
            } finally {
              session.rpcBusy = false;
            }
          });
        } else {
          throw new BridgeFailure('config', 400);
        }
      } else if (url.pathname === '/api/v1/dev-lan/session/gestures') {
        const session = requireSession(body.sessionId);
        let raw;
        try {
          raw = await callGrpcUnary(session.controlClient, 'ListGestures', {}, { deadlineMs: readDeadlineMs, principal: session.principal, signal: abortController.signal });
        } catch (error) {
          throw new BridgeFailure(mapGrpcErrorToCode(error, { invalidArgCode: 'precondition' }), error?.httpStatus ?? 502);
        }
        const gestures = Array.isArray(raw?.gestures) ? raw.gestures : [];
        data = {
          gestures: gestures
            .filter((item) => typeof item?.name === 'string' && item.name.trim() && item.name.length <= 64)
            .slice(0, 64)
            .map((item) => ({
              name: item.name.trim(),
              description: typeof item.description === 'string' ? item.description.slice(0, 128) : '',
              durationMs: Number.isFinite(Number(item.durationMs)) ? Math.max(0, Math.round(Number(item.durationMs))) : 0,
            })),
        };
      } else if (url.pathname === '/api/v1/dev-lan/session/interrupt') {
        data = await interruptSessionSerialized(requireSession(body.sessionId));
      } else if (url.pathname === '/api/v1/dev-lan/session/close') {
        if (currentSession && !currentSession.closed && currentSession.id === body.sessionId) {
          await destroySession(currentSession);
        }
        data = {};
      } else if (url.pathname === '/api/v1/dev-lan/session/recovery') {
        data = await handleSessionRecovery(requireSession(body.sessionId), body);
      } else if (url.pathname === '/api/v1/dev-lan/session/recovery-heartbeat') {
        const session = requireSession(body.sessionId);
        if (typeof body.enabled !== 'boolean') throw new BridgeFailure('config', 400);
        setRecoveryHeartbeat(session, body.enabled);
        data = {};
      } else if (url.pathname === '/api/v1/dev-lan/lingtu') {
        const checked = validateLanEndpoint(body.host, body.port === undefined ? 5050 : body.port);
        const method = typeof body.method === 'string' ? body.method.trim().toUpperCase() : 'GET';
        const targetPath = typeof body.path === 'string' ? body.path.trim() : '';
        if (
          !['GET', 'POST', 'PATCH', 'DELETE'].includes(method)
          || !/^\/api\/(?:v1\/(?:agent\/|instruction\b|readiness\b|health\b)|(?:status|health|transcript|chat|wake|stop)\b)[A-Za-z0-9/_?.=&%-]*$/.test(targetPath)
          || targetPath.includes('..')
          || targetPath.includes('//')
        ) {
          throw new BridgeFailure('config', 400);
        }
        const authority = checked.host.includes(':') ? `[${checked.host}]` : checked.host;
        const upstreamUrl = `http://${authority}:${checked.port}${targetPath}`;
        const hasPayload = body.payload !== undefined && method !== 'GET' && method !== 'DELETE';
        const proxyAbort = new AbortController();
        const proxyTimeoutMs = targetPath.startsWith('/api/chat') ? 22_000 : 4_500;
        const proxyTimer = setTimeout(() => proxyAbort.abort(), proxyTimeoutMs);
        const onParentAbort = () => proxyAbort.abort();
        abortController.signal.addEventListener('abort', onParentAbort, { once: true });
        try {
          const upstreamRes = await fetch(upstreamUrl, {
            method,
            headers: {
              Accept: 'application/json',
              ...(hasPayload ? { 'Content-Type': 'application/json' } : {}),
            },
            body: hasPayload ? JSON.stringify(body.payload) : undefined,
            redirect: 'error',
            signal: proxyAbort.signal,
          });
          const textBody = await upstreamRes.text();
          let parsedPayload = null;
          if (textBody) {
            try {
              parsedPayload = JSON.parse(textBody);
            } catch {
              parsedPayload = null;
            }
          }
          data = {
            status: upstreamRes.status,
            payload: parsedPayload,
          };
        } catch (proxyErr) {
          if (abortController.signal.aborted) throw new BridgeFailure('cancelled', 499);
          throw new BridgeFailure(proxyAbort.signal.aborted ? 'timeout' : 'unavailable', 502);
        } finally {
          clearTimeout(proxyTimer);
          abortController.signal.removeEventListener('abort', onParentAbort);
        }
      } else {
        throw new BridgeFailure('config', 404);
      }

      if (!response.writableEnded && !response.destroyed) {
        writeJson(response, 200, { ok: true, data });
      }
    } catch (error) {
      if (response.destroyed || response.writableEnded) return;
      const code = error instanceof BridgeFailure ? error.code : mapGrpcErrorToCode(error);
      const status = error instanceof BridgeFailure ? error.httpStatus : 502;
      writeJson(response, status, { ok: false, code });
    }
  };

  server = http.createServer({ maxHeaderSize: 8 * 1024 }, handler);
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;

  const address = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, listenHost, () => {
      server.off('error', reject);
      resolve(server.address());
    });
  });

  async function close() {
    if (closed) return;
    closed = true;
    if (currentSession) {
      await destroySession(currentSession).catch(() => undefined);
    }
    for (const client of readClients.values()) {
      try { client.close(); } catch { /* Ignore. */ }
    }
    readClients.clear();
    server.closeIdleConnections?.();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve()));
  }

  return Object.freeze({
    host: address.address,
    port: address.port,
    origin: `http://${address.address}:${address.port}`,
    close,
  });
}
