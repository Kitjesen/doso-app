import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import grpc from '@grpc/grpc-js';
import {
  DEFAULT_CONTRACTS_ROOT,
  MAX_LINEAR_MPS,
  MAX_MESSAGE_BYTES,
  MAX_YAW_RPS,
  PRINCIPAL_PATTERN,
  loadBrainstemContractServices,
  shutdownGrpcServer,
} from './brainstemContractProto.js';

// Dart 16-motor order matching quadruped_v3.xml / walk_ref.py:
// [FR(hip, thigh, calf), FL(hip, thigh, calf), RR(hip, thigh, calf), RL(hip, thigh, calf), feet(FR, FL, RR, RL)]
const SITTING_POSE = Object.freeze([
  -0.1, -1.35, 2.65,
  0.1, 1.35, -2.65,
  0.1, 1.35, -2.65,
  -0.1, -1.35, 2.65,
  0, 0, 0, 0,
]);
const STANDING_POSE = Object.freeze([
  -0.1, -0.8, 1.8,
  0.1, 0.8, -1.8,
  0.1, 0.8, -1.8,
  -0.1, -0.8, 1.8,
  0, 0, 0, 0,
]);
const BASE_VOLTAGES = Object.freeze(
  Array.from({ length: 16 }, (_, id) => Number((24.8 + ((id % 3) - 1) * 0.05).toFixed(2))),
);
const PROFILES = Object.freeze({
  'mini-flat': Object.freeze({ modeId: 'flat', description: 'flat: 平地行走策略（本机仿真）' }),
  'mini-stairs': Object.freeze({ modeId: 'stairs', description: 'stairs: 楼梯地形策略（本机仿真）' }),
});
const PLATFORM_PROFILE = Object.freeze({ modeId: 'platform', description: 'platform: 高台越障策略（本机仿真）' });
const MODE_TO_PROFILE = Object.freeze({
  flat: 'mini-flat',
  stairs: 'mini-stairs',
  'mini-flat': 'mini-flat',
  'mini-stairs': 'mini-stairs',
});
const PLATFORM_MODE_TO_PROFILE = Object.freeze({
  platform: 'mini-platform',
  'mini-platform': 'mini-platform',
});
const FALLBACK_SIM_GESTURES = Object.freeze([
  Object.freeze({ name: 'play_bow', description: '玩耍鞠躬', durationMs: 3220, endPose: 'standing', keyframes: null }),
  Object.freeze({ name: 'nod_yes', description: '点头同意', durationMs: 4020, endPose: 'standing', keyframes: null }),
  Object.freeze({ name: 'wiggle', description: '后摆扭身', durationMs: 4620, endPose: 'standing', keyframes: null }),
  Object.freeze({ name: 'stretch', description: '伸懒腰', durationMs: 4820, endPose: 'standing', keyframes: null }),
  Object.freeze({ name: 'dance', description: '组合舞蹈', durationMs: 26800, endPose: 'standing', keyframes: null }),
  Object.freeze({ name: 'step_back', description: '后退两步', durationMs: 3020, endPose: 'standing', keyframes: null }),
]);
const LEGACY_GESTURE_ALIASES = Object.freeze({
  bow: 'play_bow',
  nod: 'nod_yes',
});

function loadMergedSimGestures() {
  const gestureDir = path.resolve(import.meta.dirname, '../../../gesture');
  const indexPath = path.join(gestureDir, 'index.json');
  const libraryPath = path.join(gestureDir, 'library.json');
  if (!existsSync(indexPath) || !existsSync(libraryPath)) return FALLBACK_SIM_GESTURES;
  try {
    const indexJson = JSON.parse(readFileSync(indexPath, 'utf8'));
    const libraryJson = JSON.parse(readFileSync(libraryPath, 'utf8'));
    const keyframesByName = new Map(
      Array.isArray(libraryJson)
        ? libraryJson.map((item) => [item.name, Array.isArray(item.keyframes) ? item.keyframes : null])
        : [],
    );
    const items = (indexJson?.gestures ?? [])
      .filter((item) => item?.standing_trigger_allowed !== false && item?.start_pose === 'standing')
      .map((item) => Object.freeze({
        name: String(item.name),
        description: String(item.description || item.name),
        durationMs: Math.max(20, Math.round(Number(item.duration_ms) || 2000)),
        endPose: String(item.end_pose || 'standing'),
        keyframes: keyframesByName.get(item.name) ?? null,
      }));
    return items.length > 0 ? Object.freeze(items) : FALLBACK_SIM_GESTURES;
  } catch {
    return FALLBACK_SIM_GESTURES;
  }
}

const SIM_GESTURES = loadMergedSimGestures();

function sampleGestureKeyframes(keyframes, elapsedGestureMs) {
  if (!Array.isArray(keyframes) || keyframes.length === 0) return null;
  let prev = Array.isArray(keyframes[0]?.targetPose) && keyframes[0].targetPose.length >= 16
    ? keyframes[0].targetPose
    : STANDING_POSE;
  if (keyframes.length === 1 || elapsedGestureMs <= 0) return prev;
  let remainingTicks = elapsedGestureMs / 20;
  for (let i = 1; i < keyframes.length; i += 1) {
    const kf = keyframes[i];
    const target = Array.isArray(kf?.targetPose) && kf.targetPose.length >= 16 ? kf.targetPose : prev;
    const segTicks = Math.max(1, Number(kf?.counts) || 0);
    if (remainingTicks <= segTicks) {
      const alpha = Math.max(0, Math.min(1, remainingTicks / segTicks));
      return prev.map((v, idx) => v + (target[idx] - v) * alpha);
    }
    remainingTicks -= segTicks;
    prev = target;
  }
  return prev;
}
const REASONS = Object.freeze({
  NONE: 0,
  INVALID_VECTOR: 1,
  RATE_LIMITED: 2,
  FSM_NOT_READY: 3,
  MOTORS_DISABLED: 4,
  MOTOR_FAULT: 5,
  CONTROL_BUSY: 6,
  LEASE_MISSING: 7,
  LEASE_EXPIRED: 8,
  PREEMPTED: 9,
});

function grpcError(code, details) {
  return { code, details };
}

/**
 * Stateful loopback-only Brainstem gRPC simulation server for local development and automated tests.
 * Never binds outside 127.0.0.1 and never accesses CAN hardware.
 */
export async function createLocalBrainstemSimServer({
  protoRoot = DEFAULT_CONTRACTS_ROOT,
  host = '127.0.0.1',
  port = 13145,
  statePort = null,
  leaseDurationMs = 300,
  transitionDurationMs = 300,
  imuIntervalMs = 100,
  platformConfigured = false,
  heightConfigured = false,
  recoveryConfigured = false,
  extraModeCapabilities = [],
  recoveryDurationMs = 1800,
  recoveryHeartbeatTimeoutMs = 1500,
} = {}) {
  if (host !== '127.0.0.1') {
    throw new Error('Local Brainstem simulation server only binds to loopback 127.0.0.1');
  }
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('Invalid simulation server port');
  }
  if (statePort !== null && (!Number.isInteger(statePort) || statePort < 0 || statePort > 65535)) {
    throw new Error('Invalid simulation state HTTP port');
  }

  const { RobotControl, RobotRecovery } = await loadBrainstemContractServices(protoRoot);
  const enabledProfiles = platformConfigured
    ? Object.freeze({ ...PROFILES, 'mini-platform': PLATFORM_PROFILE })
    : PROFILES;
  const enabledModeToProfile = platformConfigured
    ? Object.freeze({ ...MODE_TO_PROFILE, ...PLATFORM_MODE_TO_PROFILE })
    : MODE_TO_PROFILE;
  const startedMs = performance.now();
  const elapsedMs = () => Math.max(0, performance.now() - startedMs);

  let fsmKind = 1; // GROUNDED
  let transitionKind = 0; // NONE
  let motorOutputEnabled = false;
  let activeProfile = 'mini-flat';
  let activeModeId = 'flat';
  let token = '';
  let leasePrincipal = '';
  let leaseExpiresAt = 0;
  let lastAcceptedSequence = 0n;
  let lastPayload = '';
  let lastWalkAt = null;
  let initialZeroConfirmed = false;
  let lastDecision = REASONS.NONE;
  let acceptedCount = 0n;
  let rejectedCount = 0n;
  let cmdVelocity = { x: 0, y: 0, z: 0 };
  let poseBlend = 0; // 0 = sitting/grounded, 1 = standing/walking
  let gaitPhase = 0;
  let yawAngle = 0;
  const wheelPositions = [0, 0, 0, 0];
  let leaseTimer = null;
  let transitionTimer = null;
  let gestureName = '';
  let activeGesture = null;
  let gestureStartedAt = 0;
  let zeroCalibratedAt = 0;
  let zeroCount = 0;
  let recoveryPhase = 1; // RECOVERY_PHASE_ABSENT
  let recoveryReason = 0; // RECOVERY_REJECT_NONE
  let recoveryDetail = recoveryConfigured ? 'MUJICA V89 ONNX 就绪' : '本机仿真未配置摔倒恢复模型';
  let recoveryHeartbeatAt = 0;
  let recoveryTimer = null;
  let closed = false;
  const imuStreams = new Set();

  function clearLeaseTimer() {
    if (leaseTimer) clearTimeout(leaseTimer);
    leaseTimer = null;
  }

  function clearTransitionTimer() {
    if (transitionTimer) clearTimeout(transitionTimer);
    transitionTimer = null;
  }

  function clearRecoveryTimer() {
    if (recoveryTimer) clearTimeout(recoveryTimer);
    recoveryTimer = null;
  }

  function resetMotionToStandIfWalking() {
    cmdVelocity = { x: 0, y: 0, z: 0 };
    if (fsmKind === 3) fsmKind = 2; // WALKING -> STANDING
  }

  function revokeLease(reason = REASONS.NONE) {
    clearLeaseTimer();
    token = '';
    leasePrincipal = '';
    leaseExpiresAt = 0;
    lastAcceptedSequence = 0n;
    lastPayload = '';
    lastWalkAt = null;
    initialZeroConfirmed = false;
    lastDecision = reason;
    resetMotionToStandIfWalking();
  }

  function armLeaseTimer() {
    clearLeaseTimer();
    leaseExpiresAt = elapsedMs() + leaseDurationMs;
    leaseTimer = setTimeout(() => {
      if (!closed && token) revokeLease(REASONS.LEASE_EXPIRED);
    }, leaseDurationMs);
    leaseTimer.unref?.();
  }

  function syncLeaseFreshness() {
    if (token && elapsedMs() >= leaseExpiresAt) revokeLease(REASONS.LEASE_EXPIRED);
  }

  function buildControlStatus() {
    syncLeaseFreshness();
    const active = Boolean(token);
    return {
      fsm: { kind: fsmKind, transition: transitionKind, gestureName: transitionKind === 3 ? gestureName : '' },
      motorOutputEnabled,
      owner: active ? 1 : 0,
      criticalMotorFault: false,
      grpcLeaseActive: active,
      leaseRemainingMs: active ? Math.max(0, Math.floor(leaseExpiresAt - elapsedMs())) : 0,
      lastAcceptedSequence: lastAcceptedSequence.toString(),
      lastDecision,
      readyForWalk: motorOutputEnabled && (fsmKind === 2 || fsmKind === 3),
      ownerId: active ? leasePrincipal : '',
      acceptedCount: acceptedCount.toString(),
      rejectedCount: rejectedCount.toString(),
    };
  }

  function buildProfileInfo() {
    const names = Object.keys(enabledProfiles);
    return {
      current: activeProfile,
      available: names,
      descriptions: names.map((name) => enabledProfiles[name].description),
      currentDescription: enabledProfiles[activeProfile].description,
      modeCapabilities: [
        { id: 'flat', kind: 1, availability: 2, profileId: 'mini-flat', unavailableReason: '' },
        { id: 'stairs', kind: 1, availability: 2, profileId: 'mini-stairs', unavailableReason: '' },
        platformConfigured
          ? { id: 'platform', kind: 1, availability: 2, profileId: 'mini-platform', unavailableReason: '' }
          : { id: 'platform', kind: 1, availability: 1, profileId: '', unavailableReason: '本机仿真未配置高台策略' },
        ...(heightConfigured
          ? [{ id: 'height', kind: 3, availability: 2, profileId: 'single_frame_height_v2', unavailableReason: '' }]
          : []),
        recoveryConfigured
          ? { id: 'recovery', kind: 2, availability: 2, profileId: 'mujica-v89', unavailableReason: '' }
          : { id: 'recovery', kind: 2, availability: 1, profileId: '', unavailableReason: '本机仿真未配置摔倒恢复模型' },
        ...extraModeCapabilities,
      ],
      activeModeId,
    };
  }

  function syncRecoveryHeartbeat() {
    if (!recoveryConfigured) return;
    if (recoveryPhase >= 2 && recoveryPhase <= 4 && recoveryHeartbeatAt > 0
        && elapsedMs() - recoveryHeartbeatAt > recoveryHeartbeatTimeoutMs) {
      clearRecoveryTimer();
      recoveryPhase = 1;
      recoveryReason = 7; // RECOVERY_REJECT_HEARTBEAT_EXPIRED
      recoveryDetail = '恢复心跳已超时';
      recoveryHeartbeatAt = 0;
      activeModeId = enabledProfiles[activeProfile].modeId;
    }
  }

  function buildRecoveryStatus() {
    if (!recoveryConfigured) {
      return {
        phase: 1, // RECOVERY_PHASE_ABSENT
        sessionSelected: false,
        modelConfigured: false,
        enableSequenceVerified: false,
        stableStand: fsmKind === 2,
        locomotionAvailable: fsmKind === 2 || fsmKind === 3,
        activeModeId,
        reason: 2, // RECOVERY_REJECT_MODEL_NOT_CONFIGURED
        detail: '本机仿真未配置摔倒恢复模型',
      };
    }
    syncRecoveryHeartbeat();
    const sessionSelected = recoveryPhase >= 2 && recoveryPhase <= 5;
    return {
      phase: recoveryPhase,
      sessionSelected,
      modelConfigured: true,
      enableSequenceVerified: recoveryPhase >= 3 && recoveryPhase <= 5,
      stableStand: recoveryPhase === 5 || (recoveryPhase === 1 && fsmKind === 2),
      locomotionAvailable: recoveryPhase !== 4 && (fsmKind === 2 || fsmKind === 3),
      activeModeId,
      reason: recoveryReason,
      detail: recoveryDetail,
    };
  }

  function buildImuSample() {
    const moving = fsmKind === 3 && (cmdVelocity.x !== 0 || cmdVelocity.y !== 0 || cmdVelocity.z !== 0);
    const roll = moving ? 0.03 * Math.sin(gaitPhase) : 0;
    const pitch = moving ? 0.025 * Math.cos(gaitPhase * 2) - cmdVelocity.x * 0.04 : 0;
    const halfYaw = yawAngle * 0.5;
    const halfRoll = roll * 0.5;
    const halfPitch = pitch * 0.5;
    const cy = Math.cos(halfYaw), sy = Math.sin(halfYaw);
    const cp = Math.cos(halfPitch), sp = Math.sin(halfPitch);
    const cr = Math.cos(halfRoll), sr = Math.sin(halfRoll);
    const totalMs = Math.floor(elapsedMs());
    return {
      gyroscope: {
        x: moving ? 0.08 * Math.cos(gaitPhase) : 0,
        y: moving ? -0.05 * Math.sin(gaitPhase * 2) : 0,
        z: cmdVelocity.z,
      },
      quaternion: {
        w: cr * cp * cy + sr * sp * sy,
        x: sr * cp * cy - cr * sp * sy,
        y: cr * sp * cy + sr * cp * sy,
        z: cr * cp * sy - sr * sp * cy,
      },
      timestamp: {
        seconds: String(Math.floor(totalMs / 1000)),
        nanos: (totalMs % 1000) * 1_000_000,
      },
      linearAcceleration: {
        x: cmdVelocity.x * 0.2,
        y: cmdVelocity.y * 0.2,
        z: 9.81,
      },
    };
  }

  function buildMotorStates() {
    const moving = fsmKind === 3 && (cmdVelocity.x !== 0 || cmdVelocity.y !== 0 || cmdVelocity.z !== 0);
    const speedMag = Math.hypot(cmdVelocity.x, cmdVelocity.y);
    const activeScale = Math.min(1, speedMag + Math.abs(cmdVelocity.z) * 0.3);
    const gesturePose = fsmKind === 4 && transitionKind === 3 && activeGesture?.keyframes
      ? sampleGestureKeyframes(activeGesture.keyframes, elapsedMs() - gestureStartedAt)
      : null;
    return Array.from({ length: 16 }, (_, id) => {
      const leg = Math.floor(id / 3);
      const jointInLeg = id % 3;
      const basePos = SITTING_POSE[id] + (STANDING_POSE[id] - SITTING_POSE[id]) * poseBlend;
      const legPhase = gaitPhase + (leg === 0 || leg === 3 ? 0 : Math.PI);
      const legSign = leg === 0 || leg === 3 ? 1 : -1;
      const hipSwing = jointInLeg === 0 ? 0.05 * cmdVelocity.y * Math.sin(legPhase) : 0;
      const thighSwing = jointInLeg === 1 ? -0.18 * legSign * Math.sin(legPhase) : 0;
      const calfSwing = jointInLeg === 2 ? 0.24 * legSign * Math.sin(legPhase) : 0;
      const swing = moving && id < 12 ? (hipSwing + (thighSwing + calfSwing) * activeScale) : 0;
      const wheelIdx = id >= 12 ? id - 12 : -1;
      const wheelSideSign = wheelIdx === 0 || wheelIdx === 2 ? -1 : 1; // right vs left turn differential
      const wheelVel = wheelIdx >= 0
        ? cmdVelocity.x * 8 + wheelSideSign * cmdVelocity.z * 2.5
        : moving ? 1.4 * Math.cos(legPhase) * speedMag : 0;
      const pos = gesturePose ? gesturePose[id] : id < 12 ? basePos + swing : wheelPositions[wheelIdx];
      return {
        id,
        online: true,
        statusCode: motorOutputEnabled ? 2 : 1,
        temperature: Number((34.5 + (id % 4) * 0.4 + (motorOutputEnabled ? 1.2 : 0)).toFixed(1)),
        voltage: 0,
        position: Number(pos.toFixed(4)),
        velocity: Number(wheelVel.toFixed(4)),
        torque: Number((motorOutputEnabled ? (id >= 12 ? cmdVelocity.x * 1.6 : (jointInLeg === 2 ? -14.2 : 8.5)) : 0.1).toFixed(3)),
        errors: [],
      };
    });
  }

  const tickTimer = setInterval(() => {
    syncLeaseFreshness();
    if (fsmKind === 2 || fsmKind === 3) poseBlend = Math.min(1, poseBlend + 0.15);
    else if (fsmKind === 1 || fsmKind === 0) poseBlend = Math.max(0, poseBlend - 0.15);
    const moving = fsmKind === 3 && (cmdVelocity.x !== 0 || cmdVelocity.y !== 0 || cmdVelocity.z !== 0);
    if (moving) {
      gaitPhase += 0.25;
      yawAngle += cmdVelocity.z * 0.02;
      for (let w = 0; w < 4; w += 1) {
        const wheelSideSign = w === 0 || w === 2 ? -1 : 1;
        const wheelVel = cmdVelocity.x * 8 + wheelSideSign * cmdVelocity.z * 2.5;
        wheelPositions[w] += wheelVel * 0.02;
      }
    }
  }, 20);
  tickTimer.unref?.();

  const imuTimer = setInterval(() => {
    if (!imuStreams.size) return;
    const sample = buildImuSample();
    for (const stream of [...imuStreams]) {
      if (stream.cancelled || stream.destroyed) {
        imuStreams.delete(stream);
        continue;
      }
      try { stream.write(sample); } catch { imuStreams.delete(stream); }
    }
  }, imuIntervalMs);
  imuTimer.unref?.();

  function requireDevPrincipal(call, requireLeaseOwner = false) {
    const values = call.metadata.get('x-doso-dev-client');
    if (values.length !== 1 || typeof values[0] !== 'string' || !PRINCIPAL_PATTERN.test(values[0])) {
      throw grpcError(grpc.status.PERMISSION_DENIED, 'Missing or invalid x-doso-dev-client principal');
    }
    syncLeaseFreshness();
    if (requireLeaseOwner && token && values[0] !== leasePrincipal) {
      throw grpcError(grpc.status.PERMISSION_DENIED, 'Principal does not match active lease');
    }
    return values[0];
  }

  function sendSimMetadata(call) {
    const metadata = new grpc.Metadata();
    metadata.set('x-doso-simulation', 'true');
    call.sendMetadata(metadata);
  }

  function unaryHandler(fn, { write = false, requireLeaseOwner = false } = {}) {
    return (call, callback) => {
      sendSimMetadata(call);
      try {
        const principal = write ? requireDevPrincipal(call, requireLeaseOwner) : null;
        callback(null, fn(call.request ?? {}, call, principal));
      } catch (error) {
        callback({
          code: Number.isInteger(error?.code) ? error.code : grpc.status.FAILED_PRECONDITION,
          details: error?.details || 'SIMULATION rejected',
        });
      }
    };
  }

  function finishTransition(targetKind) {
    clearTransitionTimer();
    const apply = () => {
      transitionTimer = null;
      if (closed || !motorOutputEnabled) return;
      fsmKind = targetKind;
      transitionKind = 0;
      poseBlend = targetKind === 2 ? 1 : 0;
    };
    if (transitionDurationMs <= 0) {
      apply();
      return;
    }
    fsmKind = 4; // TRANSITIONING
    transitionKind = targetKind === 2 ? 1 : 2;
    transitionTimer = setTimeout(apply, transitionDurationMs);
    transitionTimer.unref?.();
  }

  const controlImpl = {
    GetControlStatus: unaryHandler(() => buildControlStatus()),
    GetProfile: unaryHandler(() => buildProfileInfo()),
    GetVoltage: unaryHandler(() => ({ values: [...BASE_VOLTAGES] })),
    GetMotorStatus: unaryHandler(() => ({ motors: buildMotorStates() })),
    SwitchProfile: unaryHandler((request) => {
      syncLeaseFreshness();
      if (token || (fsmKind !== 1 && fsmKind !== 2)) {
        throw grpcError(grpc.status.FAILED_PRECONDITION, 'SwitchProfile requires Grounded or Standing with no lease');
      }
      const mapped = enabledModeToProfile[String(request.name ?? '').trim()];
      if (!mapped || !enabledProfiles[mapped]) {
        throw grpcError(grpc.status.INVALID_ARGUMENT, 'Unknown profile');
      }
      activeProfile = mapped;
      activeModeId = enabledProfiles[mapped].modeId;
      return buildProfileInfo();
    }, { write: true }),
    ListGestures: unaryHandler(() => ({
      gestures: SIM_GESTURES.map(({ name, description, durationMs }) => ({ name, description, durationMs })),
    })),
    PlayGesture: unaryHandler((request) => {
      syncLeaseFreshness();
      const rawName = String(request.name ?? '').trim();
      const resolvedName = LEGACY_GESTURE_ALIASES[rawName] ?? rawName;
      const gesture = SIM_GESTURES.find((item) => item.name === resolvedName);
      if (!gesture) throw grpcError(grpc.status.INVALID_ARGUMENT, 'Unknown gesture');
      if (token || !motorOutputEnabled || fsmKind !== 2) {
        throw grpcError(grpc.status.FAILED_PRECONDITION, 'PlayGesture requires Standing with motors enabled and no lease');
      }
      clearTransitionTimer();
      fsmKind = 4;
      transitionKind = 3;
      gestureName = gesture.name;
      activeGesture = gesture;
      gestureStartedAt = elapsedMs();
      transitionTimer = setTimeout(() => {
        transitionTimer = null;
        if (closed) return;
        const endsGrounded = gesture.endPose === 'sitting' || gesture.endPose === 'lying';
        gestureName = '';
        activeGesture = null;
        transitionKind = 0;
        if (!motorOutputEnabled || endsGrounded) {
          fsmKind = 1;
          poseBlend = 0;
        } else {
          fsmKind = 2;
          poseBlend = 1;
        }
      }, Math.max(0, Math.min(gesture.durationMs, transitionDurationMs > 0 ? gesture.durationMs : 0)));
      transitionTimer.unref?.();
      return {};
    }, { write: true }),
    SetZero: unaryHandler(() => {
      syncLeaseFreshness();
      if (token || fsmKind !== 1) throw grpcError(grpc.status.FAILED_PRECONDITION, 'SetZero requires Grounded with no lease');
      zeroCalibratedAt = Date.now();
      zeroCount += 1;
      return {};
    }, { write: true }),
    ClearMotorFault: unaryHandler(() => ({}), { write: true }),
    Enable: unaryHandler(() => {
      motorOutputEnabled = true;
      return {};
    }, { write: true }),
    Disable: unaryHandler(() => {
      clearTransitionTimer();
      clearRecoveryTimer();
      revokeLease(REASONS.NONE);
      motorOutputEnabled = false;
      fsmKind = 1;
      transitionKind = 0;
      if (recoveryConfigured) {
        recoveryPhase = 1;
        recoveryReason = 0;
        recoveryDetail = 'MUJICA V89 ONNX 就绪';
        recoveryHeartbeatAt = 0;
        activeModeId = enabledProfiles[activeProfile].modeId;
      }
      return {};
    }, { write: true }),
    StandUp: unaryHandler(() => {
      syncLeaseFreshness();
      if (!motorOutputEnabled || fsmKind === 4 || (fsmKind === 3 && token)) {
        throw grpcError(grpc.status.FAILED_PRECONDITION, 'StandUp precondition not met');
      }
      if (fsmKind === 2) return {};
      if (fsmKind === 3) resetMotionToStandIfWalking();
      finishTransition(2);
      return {};
    }, { write: true }),
    SitDown: unaryHandler(() => {
      if (!motorOutputEnabled || (fsmKind !== 2 && fsmKind !== 3)) {
        throw grpcError(grpc.status.FAILED_PRECONDITION, 'SitDown requires Standing or Walking with motors enabled');
      }
      revokeLease(REASONS.NONE);
      finishTransition(1);
      return {};
    }, { write: true }),
    AcquireControl: unaryHandler((request, _call, principal) => {
      if (request.clientId !== principal) {
        throw grpcError(grpc.status.PERMISSION_DENIED, 'client_id mismatch');
      }
      syncLeaseFreshness();
      if (token) return { accepted: false, token: '', leaseDurationMs, reason: REASONS.CONTROL_BUSY, status: buildControlStatus() };
      if (!motorOutputEnabled) return { accepted: false, token: '', leaseDurationMs, reason: REASONS.MOTORS_DISABLED, status: buildControlStatus() };
      if (fsmKind !== 2 && fsmKind !== 3) return { accepted: false, token: '', leaseDurationMs, reason: REASONS.FSM_NOT_READY, status: buildControlStatus() };
      token = randomBytes(24).toString('hex');
      leasePrincipal = principal;
      lastAcceptedSequence = 0n;
      lastPayload = '';
      lastWalkAt = null;
      initialZeroConfirmed = false;
      lastDecision = REASONS.NONE;
      armLeaseTimer();
      return { accepted: true, token, leaseDurationMs, reason: REASONS.NONE, status: buildControlStatus() };
    }, { write: true }),
    RenewControlLease: unaryHandler((request) => {
      syncLeaseFreshness();
      if (!token || request.token !== token) {
        return { accepted: false, token: '', leaseDurationMs, reason: request.token ? REASONS.LEASE_EXPIRED : REASONS.LEASE_MISSING, status: buildControlStatus() };
      }
      armLeaseTimer();
      return { accepted: true, token, leaseDurationMs, reason: REASONS.NONE, status: buildControlStatus() };
    }, { write: true, requireLeaseOwner: true }),
    ReleaseControl: unaryHandler((request) => {
      syncLeaseFreshness();
      if (token && request.token === token) revokeLease(REASONS.NONE);
      return buildControlStatus();
    }, { write: true, requireLeaseOwner: true }),
    WalkChecked: unaryHandler((request) => {
      const at = elapsedMs();
      syncLeaseFreshness();
      let sequence;
      try { sequence = BigInt(String(request.sequence ?? '0')); } catch { sequence = 0n; }
      const dir = request.direction ?? {};
      const vec = { x: Number(dir.x ?? 0), y: Number(dir.y ?? 0), z: Number(dir.z ?? 0) };
      const payload = JSON.stringify(vec);
      const duplicate = Boolean(token && sequence === lastAcceptedSequence && payload === lastPayload);
      let reason = REASONS.NONE;
      if (!token || request.token !== token) reason = request.token ? REASONS.LEASE_EXPIRED : REASONS.LEASE_MISSING;
      else if (![vec.x, vec.y, vec.z].every(Number.isFinite) || Math.abs(vec.x) > MAX_LINEAR_MPS || Math.abs(vec.y) > MAX_LINEAR_MPS || Math.abs(vec.z) > MAX_YAW_RPS) reason = REASONS.INVALID_VECTOR;
      else if (!motorOutputEnabled) reason = REASONS.MOTORS_DISABLED;
      else if (fsmKind !== 2 && fsmKind !== 3) reason = REASONS.FSM_NOT_READY;
      else if (sequence <= 0n || (!duplicate && lastAcceptedSequence !== 0n && sequence !== lastAcceptedSequence + 1n) || (!duplicate && lastAcceptedSequence === 0n && sequence !== 1n)) reason = REASONS.RATE_LIMITED;
      else if (!duplicate && lastWalkAt !== null && at - lastWalkAt < 18) reason = REASONS.RATE_LIMITED;
      else if (!initialZeroConfirmed && (vec.x !== 0 || vec.y !== 0 || vec.z !== 0)) reason = REASONS.CONTROL_BUSY;

      if (reason !== REASONS.NONE) {
        rejectedCount += 1n;
        if (reason !== REASONS.CONTROL_BUSY && token && request.token === token) revokeLease(reason);
        else lastDecision = reason;
        return { accepted: false, reason, sequence: sequence.toString(), status: buildControlStatus() };
      }
      armLeaseTimer();
      if (!duplicate) {
        acceptedCount += 1n;
        lastAcceptedSequence = sequence;
        lastPayload = payload;
        lastWalkAt = at;
      }
      if (vec.x === 0 && vec.y === 0 && vec.z === 0) {
        initialZeroConfirmed = true;
        cmdVelocity = { x: 0, y: 0, z: 0 };
        fsmKind = 2;
      } else {
        cmdVelocity = vec;
        fsmKind = 3;
      }
      lastDecision = REASONS.NONE;
      return { accepted: true, reason: REASONS.NONE, sequence: sequence.toString(), status: buildControlStatus() };
    }, { write: true, requireLeaseOwner: true }),
    ListenImu(call) {
      sendSimMetadata(call);
      if (closed) {
        call.end();
        return;
      }
      imuStreams.add(call);
      const cleanup = () => imuStreams.delete(call);
      call.once('cancelled', cleanup);
      call.once('close', cleanup);
      call.once('error', cleanup);
      try { call.write(buildImuSample()); } catch { cleanup(); }
    },
  };

  for (const methodName of Object.keys(RobotControl.service)) {
    if (!controlImpl[methodName]) {
      const def = RobotControl.service[methodName];
      controlImpl[methodName] = def.responseStream
        ? (call) => { sendSimMetadata(call); call.destroy(grpcError(grpc.status.UNIMPLEMENTED, 'SIMULATION unsupported')); }
        : (_call, callback) => callback(grpcError(grpc.status.UNIMPLEMENTED, 'SIMULATION unsupported'));
    }
  }

  const recoveryImpl = {
    GetStatus: unaryHandler(() => buildRecoveryStatus()),
    Enter: unaryHandler(() => {
      if (!recoveryConfigured) return buildRecoveryStatus();
      syncRecoveryHeartbeat();
      if (fsmKind === 3) {
        recoveryReason = 4; // RECOVERY_REJECT_WALKING
        recoveryDetail = '行走中不可进入摔倒恢复';
        return buildRecoveryStatus();
      }
      clearTransitionTimer();
      clearRecoveryTimer();
      revokeLease(REASONS.PREEMPTED);
      recoveryPhase = 2; // RECOVERY_PHASE_SELECTED
      recoveryReason = 0;
      recoveryDetail = '已选中摔倒恢复会话';
      recoveryHeartbeatAt = elapsedMs();
      activeModeId = 'recovery';
      return buildRecoveryStatus();
    }),
    Enable: unaryHandler(() => {
      if (!recoveryConfigured) return buildRecoveryStatus();
      syncRecoveryHeartbeat();
      if (recoveryPhase < 2) {
        recoveryReason = 5; // RECOVERY_REJECT_NOT_SELECTED
        recoveryDetail = '尚未进入摔倒恢复';
        return buildRecoveryStatus();
      }
      motorOutputEnabled = true;
      recoveryPhase = 3; // RECOVERY_PHASE_ENABLED
      recoveryReason = 0;
      recoveryDetail = 'MUJICA V89 恢复策略已使能';
      recoveryHeartbeatAt = elapsedMs();
      return buildRecoveryStatus();
    }),
    Heartbeat: unaryHandler(() => {
      if (!recoveryConfigured) return buildRecoveryStatus();
      if (recoveryPhase >= 2) {
        recoveryHeartbeatAt = elapsedMs();
        if (recoveryReason === 7) recoveryReason = 0;
      }
      return buildRecoveryStatus();
    }),
    Start: unaryHandler(() => {
      if (!recoveryConfigured) return buildRecoveryStatus();
      syncRecoveryHeartbeat();
      if (recoveryPhase < 2) {
        recoveryReason = 5; // RECOVERY_REJECT_NOT_SELECTED
        recoveryDetail = '尚未进入摔倒恢复';
        return buildRecoveryStatus();
      }
      motorOutputEnabled = true;
      clearRecoveryTimer();
      recoveryPhase = 4; // RECOVERY_PHASE_GETTING_UP
      recoveryReason = 0;
      recoveryDetail = '正在执行摔倒起立动作';
      recoveryHeartbeatAt = elapsedMs();
      const applyStable = () => {
        recoveryTimer = null;
        if (closed) return;
        recoveryPhase = 5; // RECOVERY_PHASE_STABLE_STAND
        fsmKind = 2;
        transitionKind = 0;
        poseBlend = 1;
        recoveryDetail = '已恢复稳定站立';
      };
      if (recoveryDurationMs <= 0) {
        applyStable();
      } else {
        recoveryTimer = setTimeout(applyStable, recoveryDurationMs);
        recoveryTimer.unref?.();
      }
      return buildRecoveryStatus();
    }),
    Cancel: unaryHandler(() => {
      if (!recoveryConfigured) return buildRecoveryStatus();
      clearRecoveryTimer();
      recoveryPhase = 1; // RECOVERY_PHASE_ABSENT
      recoveryReason = 0;
      recoveryDetail = '已取消摔倒恢复';
      recoveryHeartbeatAt = 0;
      activeModeId = enabledProfiles[activeProfile].modeId;
      return buildRecoveryStatus();
    }),
    Exit: unaryHandler(() => {
      if (!recoveryConfigured) return buildRecoveryStatus();
      syncRecoveryHeartbeat();
      if (recoveryPhase === 4) {
        recoveryReason = 6; // RECOVERY_REJECT_NOT_STABLE
        recoveryDetail = '尚未稳定站立，不能交回运动控制';
        return buildRecoveryStatus();
      }
      clearRecoveryTimer();
      recoveryPhase = 1; // RECOVERY_PHASE_ABSENT
      recoveryReason = 0;
      recoveryDetail = '';
      recoveryHeartbeatAt = 0;
      activeModeId = enabledProfiles[activeProfile].modeId;
      if (motorOutputEnabled) {
        fsmKind = 2;
        transitionKind = 0;
        poseBlend = 1;
      }
      return buildRecoveryStatus();
    }),
  };

  const server = new grpc.Server({
    'grpc.max_receive_message_length': MAX_MESSAGE_BYTES,
    'grpc.max_send_message_length': MAX_MESSAGE_BYTES,
  });
  server.addService(RobotControl.service, controlImpl);
  server.addService(RobotRecovery.service, recoveryImpl);

  const boundPort = await new Promise((resolve, reject) => {
    server.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (error, value) => {
      if (error) reject(error);
      else resolve(value);
    });
  });

  let stateServer = null;
  let boundStatePort = null;
  if (statePort !== null) {
    stateServer = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && reqUrl.pathname === '/api/v1/sim/state') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({
          ok: true,
          simulation: true,
          status: buildControlStatus(),
          profile: buildProfileInfo(),
          velocity: { ...cmdVelocity },
          poseBlend,
          gaitPhase,
          yawAngle,
          imu: buildImuSample(),
          motors: buildMotorStates(),
          calibration: { zeroCount, zeroCalibratedAt },
          recovery: buildRecoveryStatus(),
        }));
        return;
      }
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok: false, code: 'not_found' }));
    });
    const addr = await new Promise((resolve, reject) => {
      stateServer.once('error', reject);
      stateServer.listen(statePort, '127.0.0.1', () => {
        stateServer.off('error', reject);
        resolve(stateServer.address());
      });
    });
    boundStatePort = typeof addr === 'object' && addr ? addr.port : statePort;
  }

  async function close() {
    if (closed) return;
    closed = true;
    clearInterval(tickTimer);
    clearInterval(imuTimer);
    clearLeaseTimer();
    clearTransitionTimer();
    clearRecoveryTimer();
    for (const stream of [...imuStreams]) {
      try { stream.end(); } catch { /* Ignore closed stream. */ }
    }
    imuStreams.clear();
    if (stateServer) {
      stateServer.closeIdleConnections?.();
      stateServer.closeAllConnections?.();
      await new Promise((resolve) => stateServer.close(() => resolve()));
    }
    await shutdownGrpcServer(server);
  }

  return Object.freeze({
    source: 'SIMULATION',
    simulation: true,
    host,
    port: boundPort,
    statePort: boundStatePort,
    snapshot: () => ({ status: buildControlStatus(), profile: buildProfileInfo(), velocity: { ...cmdVelocity } }),
    close,
  });
}
