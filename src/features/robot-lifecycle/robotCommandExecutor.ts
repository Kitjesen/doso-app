import type { RobotCapability } from './robotCapabilityReadiness.ts';

export type RobotCommandStatus =
  | 'submitting'
  | 'accepted'
  | 'executing'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type RobotCommandAckStatus = Exclude<RobotCommandStatus, 'submitting'> | 'rejected';

export type RobotCommandPermissionSnapshot = Readonly<{
  authorityEpoch: string | number;
  capabilityAvailable: boolean;
  connected: boolean;
  deviceId: string | null;
  hasDevice: boolean;
  safetyLock: boolean;
}>;

export type RobotCommand = Readonly<{
  capability: RobotCapability;
  commandId: string;
  deadlineMs: number;
  deviceId: string;
  payload: unknown;
}>;

type RobotCommandIdentity = Pick<RobotCommand, 'capability' | 'commandId' | 'deadlineMs' | 'deviceId'>;

export type RobotCommandAck = Readonly<{
  attemptId: string;
  authenticated: boolean;
  commandId: string;
  deviceId: string;
  reason?: string;
  status: RobotCommandAckStatus;
}>;

export type RobotCommandAttemptState = Readonly<{
  attemptId: string;
  capability: RobotCapability;
  commandId: string;
  deadlineMs: number;
  deviceId: string;
  reason?: string;
  status: RobotCommandStatus;
}>;

export type RobotCommandExecutionContext = Readonly<{
  acknowledge: (ack: RobotCommandAck) => void;
  attemptId: string;
  signal: AbortSignal;
}>;

export type RobotCommandExecutor = Readonly<{
  supports: (capability: RobotCapability) => boolean;
  execute: (command: RobotCommand, context: RobotCommandExecutionContext) => void | Promise<void>;
}>;

export type RobotCommandSupport = Readonly<{
  reason?: string;
  state: 'supported' | 'unsupported' | 'unavailable' | 'fault';
  supported: boolean;
}>;

export type RobotCommandClock = Readonly<{
  clearTimeout: (timer: unknown) => void;
  now: () => number;
  setTimeout: (callback: () => void, delayMs: number) => unknown;
}>;

export type RobotCommandAttempt = Readonly<{
  attemptId: string;
  cancel: (reason?: string) => void;
  state: () => RobotCommandAttemptState;
  subscribe: (listener: (state: RobotCommandAttemptState) => void) => () => void;
}>;

export type RobotCommandCoordinator = Readonly<{
  cancelAll: (reason?: string) => void;
  dispatch: (command: RobotCommand) => RobotCommandAttempt;
}>;

export type RobotCommandCoordinatorOptions = Readonly<{
  clock: RobotCommandClock;
  createAttemptId: () => string;
  executor: RobotCommandExecutor | null;
  readPermission: (capability: RobotCapability) => RobotCommandPermissionSnapshot;
}>;

const TERMINAL = new Set<RobotCommandStatus>(['succeeded', 'failed', 'expired', 'cancelled']);
const ACK_STATUSES = new Set<RobotCommandAckStatus>([
  'accepted',
  'executing',
  'succeeded',
  'failed',
  'expired',
  'cancelled',
  'rejected',
]);
const ACK_TRANSITIONS: Readonly<Record<'submitting' | 'accepted' | 'executing', ReadonlySet<RobotCommandAckStatus>>> = {
  submitting: new Set(['accepted', 'executing', 'succeeded', 'failed', 'expired', 'cancelled', 'rejected']),
  accepted: new Set(['executing', 'succeeded', 'failed', 'expired', 'cancelled', 'rejected']),
  executing: new Set(['succeeded', 'failed', 'expired', 'cancelled', 'rejected']),
};
const EXECUTOR_SUPPORT_FAULT_REASON = '命令执行器故障，未下发';

type MutableAttempt = {
  abortController: AbortController;
  history: RobotCommandAttemptState[];
  initialPermission: RobotCommandPermissionSnapshot;
  listeners: Set<(state: RobotCommandAttemptState) => void>;
  state: RobotCommandAttemptState;
  timer: unknown;
};

export function createRobotCommandCoordinator(options: RobotCommandCoordinatorOptions): RobotCommandCoordinator {
  const activeByCapability = new Map<RobotCapability, { attempt: MutableAttempt; handle: RobotCommandAttempt }>();
  let invalidatingAuthority = false;

  const dispatch = (command: RobotCommand): RobotCommandAttempt => {
    const commandIdentity = snapshotCommandIdentity(command);
    let runtimeCommand: RobotCommand;
    try {
      runtimeCommand = snapshotCommand(commandIdentity, command.payload);
    } catch (error) {
      return rejectedAttempt(commandIdentity, options.createAttemptId(), errorReason(error, 'command snapshot failed'));
    }

    if (invalidatingAuthority) {
      return rejectedAttempt(runtimeCommand, options.createAttemptId(), 'command authority invalidation in progress');
    }

    const active = activeByCapability.get(runtimeCommand.capability);
    if (active && !TERMINAL.has(active.attempt.state.status)) return active.handle;

    const attemptId = options.createAttemptId();
    const abortController = new AbortController();
    let snapshot: RobotCommandPermissionSnapshot;

    try {
      const nextSnapshot = normalizePermissionSnapshot(options.readPermission(runtimeCommand.capability));
      if (!nextSnapshot) return rejectedAttempt(runtimeCommand, attemptId, 'permission snapshot invalid');
      snapshot = nextSnapshot;
    } catch {
      return rejectedAttempt(runtimeCommand, attemptId, 'permission snapshot unavailable');
    }

    const deniedReason = dispatchDeniedReason(runtimeCommand, snapshot);
    if (deniedReason) return rejectedAttempt(runtimeCommand, attemptId, deniedReason);
    const support = inspectRobotCommandSupport(options.executor, runtimeCommand.capability);
    if (!support.supported) return rejectedAttempt(runtimeCommand, attemptId, support.reason ?? 'executor unavailable');

    try {
      const nextSnapshot = normalizePermissionSnapshot(options.readPermission(runtimeCommand.capability));
      if (!nextSnapshot) return rejectedAttempt(runtimeCommand, attemptId, 'pre-dispatch permission snapshot invalid');
      snapshot = nextSnapshot;
    } catch {
      return rejectedAttempt(runtimeCommand, attemptId, 'pre-dispatch permission snapshot unavailable');
    }
    const preDispatchDeniedReason = dispatchDeniedReason(runtimeCommand, snapshot);
    if (preDispatchDeniedReason) return rejectedAttempt(runtimeCommand, attemptId, preDispatchDeniedReason);

    const remainingMs = runtimeCommand.deadlineMs - options.clock.now();
    if (!Number.isFinite(runtimeCommand.deadlineMs) || remainingMs <= 0) {
      return rejectedAttempt(runtimeCommand, attemptId, 'command deadline expired', 'expired');
    }

    const attempt: MutableAttempt = {
      abortController,
      history: [],
      initialPermission: snapshot,
      listeners: new Set(),
      state: stateFor(runtimeCommand, attemptId, 'submitting'),
      timer: undefined,
    };
    attempt.history.push(attempt.state);

    const record = (state: RobotCommandAttemptState) => {
      attempt.state = state;
      attempt.history.push(state);
    };

    const publish = (state: RobotCommandAttemptState) => {
      record(state);
      for (const listener of attempt.listeners) notifyListener(listener, state);
    };

    const finish = (status: RobotCommandStatus, reason?: string) => {
      if (TERMINAL.has(attempt.state.status)) return;
      const terminalState = stateFor(runtimeCommand, attemptId, status, reason);
      record(terminalState);
      options.clock.clearTimeout(attempt.timer);
      const current = activeByCapability.get(runtimeCommand.capability);
      if (current?.attempt === attempt) activeByCapability.delete(runtimeCommand.capability);
      if (!abortController.signal.aborted && status !== 'succeeded') abortController.abort(reason);
      const terminalListeners = [...attempt.listeners];
      attempt.listeners.clear();
      for (const listener of terminalListeners) notifyListener(listener, terminalState);
    };

    const acknowledge = (ack: RobotCommandAck) => {
      const runtimeAck = normalizeRobotCommandAck(ack);
      if (!runtimeAck) return;
      const current = activeByCapability.get(runtimeCommand.capability);
      if (!current || current.attempt !== attempt || TERMINAL.has(attempt.state.status)) return;
      if (runtimeAck.attemptId !== attemptId
        || runtimeAck.commandId !== runtimeCommand.commandId
        || runtimeAck.deviceId !== runtimeCommand.deviceId) return;

      const allowedTransitions = ACK_TRANSITIONS[attempt.state.status as keyof typeof ACK_TRANSITIONS];
      if (!allowedTransitions?.has(runtimeAck.status)) return;

      if (options.clock.now() >= runtimeCommand.deadlineMs) {
        finish('expired', 'command deadline expired');
        return;
      }

      if (runtimeAck.status === 'accepted') {
        publish(stateFor(runtimeCommand, attemptId, 'accepted'));
        return;
      }
      if (runtimeAck.status === 'executing') {
        publish(stateFor(runtimeCommand, attemptId, 'executing'));
        return;
      }
      if (runtimeAck.status === 'succeeded') {
        const finalReason = finalPermissionDeniedReason(runtimeCommand, attempt.initialPermission, options, runtimeCommand.capability);
        if (finalReason) finish('failed', finalReason);
        else finish('succeeded');
        return;
      }
      if (runtimeAck.status === 'rejected') {
        finish('failed', runtimeAck.reason ?? 'device rejected command');
        return;
      }
      finish(runtimeAck.status, runtimeAck.reason);
    };

    const handle: RobotCommandAttempt = Object.freeze({
      attemptId,
      cancel: (reason) => finish('cancelled', reason ?? 'command cancelled'),
      state: () => attempt.state,
      subscribe: (listener) => {
        for (const state of attempt.history) notifyListener(listener, state);
        if (TERMINAL.has(attempt.state.status)) return () => undefined;
        attempt.listeners.add(listener);
        return () => attempt.listeners.delete(listener);
      },
    });

    activeByCapability.set(runtimeCommand.capability, { attempt, handle });
    attempt.timer = options.clock.setTimeout(() => finish('expired', 'command deadline expired'), remainingMs);

    try {
      const execution = options.executor!.execute(runtimeCommand, Object.freeze({ acknowledge, attemptId, signal: abortController.signal }));
      Promise.resolve(execution).catch((error: unknown) => {
        finish('failed', errorReason(error, 'executor failed'));
      });
    } catch (error) {
      finish('failed', errorReason(error, 'executor failed'));
    }

    return handle;
  };

  const cancelAll = (reason = 'command authority changed') => {
    if (invalidatingAuthority) return;
    invalidatingAuthority = true;
    try {
      for (const { handle } of [...activeByCapability.values()]) handle.cancel(reason);
    } finally {
      invalidatingAuthority = false;
    }
  };

  return Object.freeze({ cancelAll, dispatch });
}

export function inspectRobotCommandSupport(
  executor: RobotCommandExecutor | null,
  capability: RobotCapability,
): RobotCommandSupport {
  if (!executor) {
    return Object.freeze({ reason: 'executor unavailable', state: 'unavailable', supported: false });
  }
  try {
    const supported = executor.supports(capability);
    if (supported === true) return Object.freeze({ state: 'supported', supported: true });
    if (supported === false) {
      return Object.freeze({ reason: 'executor does not support capability', state: 'unsupported', supported: false });
    }
    return Object.freeze({ reason: EXECUTOR_SUPPORT_FAULT_REASON, state: 'fault', supported: false });
  } catch {
    return Object.freeze({
      reason: EXECUTOR_SUPPORT_FAULT_REASON,
      state: 'fault',
      supported: false,
    });
  }
}

function snapshotCommandIdentity(command: RobotCommand): RobotCommandIdentity {
  return Object.freeze({
    capability: command.capability,
    commandId: command.commandId,
    deadlineMs: command.deadlineMs,
    deviceId: command.deviceId,
  });
}

function snapshotCommand(identity: RobotCommandIdentity, payload: unknown): RobotCommand {
  return Object.freeze({ ...identity, payload: cloneAndFreezePayload(payload, new WeakSet<object>()) });
}

function cloneAndFreezePayload(value: unknown, ancestors: WeakSet<object>): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('command payload contains a non-finite number');
    return value;
  }
  if (typeof value !== 'object') throw new Error(`unsupported command payload type: ${typeof value}`);
  if (ancestors.has(value)) throw new Error('cyclic command payload is not supported');

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const keys = Reflect.ownKeys(value).filter((key) => key !== 'length');
      if (keys.length !== value.length || keys.some((key, index) => key !== String(index))) {
        throw new Error('command payload arrays must be dense and index-only');
      }
      const clone = new Array<unknown>(value.length);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !('value' in descriptor)) {
          throw new Error('command payload array entries must be enumerable data values');
        }
        clone[index] = cloneAndFreezePayload(descriptor.value, ancestors);
      }
      return Object.freeze(clone);
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error('command payload objects must use a plain prototype');
    }
    const clone: Record<string, unknown> = Object.create(null);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') throw new Error('command payload symbol keys are not supported');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !('value' in descriptor)) {
        throw new Error('command payload properties must be enumerable data values');
      }
      Object.defineProperty(clone, key, {
        configurable: false,
        enumerable: true,
        value: cloneAndFreezePayload(descriptor.value, ancestors),
        writable: false,
      });
    }
    return Object.freeze(clone);
  } finally {
    ancestors.delete(value);
  }
}

function isRobotCommandAckStatus(status: unknown): status is RobotCommandAckStatus {
  return typeof status === 'string' && ACK_STATUSES.has(status as RobotCommandAckStatus);
}

const INVALID_DATA_PROPERTY = Symbol('invalid data property');

function ownDataValue(object: object, key: PropertyKey): unknown | typeof INVALID_DATA_PROPERTY {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && 'value' in descriptor ? descriptor.value : INVALID_DATA_PROPERTY;
}

function ownOptionalDataValue(object: object, key: PropertyKey): unknown | typeof INVALID_DATA_PROPERTY {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor) return undefined;
  return 'value' in descriptor ? descriptor.value : INVALID_DATA_PROPERTY;
}

function normalizeRobotCommandAck(ack: unknown): RobotCommandAck | null {
  if (typeof ack !== 'object' || ack === null) return null;
  try {
    const prototype = Object.getPrototypeOf(ack);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const authenticated = ownDataValue(ack, 'authenticated');
    const attemptId = ownDataValue(ack, 'attemptId');
    const commandId = ownDataValue(ack, 'commandId');
    const deviceId = ownDataValue(ack, 'deviceId');
    const status = ownDataValue(ack, 'status');
    const reason = ownOptionalDataValue(ack, 'reason');
    if (authenticated !== true || typeof attemptId !== 'string' || typeof commandId !== 'string'
      || typeof deviceId !== 'string' || !isRobotCommandAckStatus(status)
      || reason === INVALID_DATA_PROPERTY || (reason !== undefined && typeof reason !== 'string')) return null;
    return Object.freeze({ attemptId, authenticated: true, commandId, deviceId, ...(typeof reason === 'string' ? { reason } : {}), status });
  } catch {
    return null;
  }
}

function normalizePermissionSnapshot(value: unknown): RobotCommandPermissionSnapshot | null {
  if (typeof value !== 'object' || value === null) return null;
  try {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const authorityEpoch = ownDataValue(value, 'authorityEpoch');
    const capabilityAvailable = ownDataValue(value, 'capabilityAvailable');
    const connected = ownDataValue(value, 'connected');
    const deviceId = ownDataValue(value, 'deviceId');
    const hasDevice = ownDataValue(value, 'hasDevice');
    const safetyLock = ownDataValue(value, 'safetyLock');
    if (!((typeof authorityEpoch === 'string') || (typeof authorityEpoch === 'number' && Number.isFinite(authorityEpoch)))
      || typeof capabilityAvailable !== 'boolean' || typeof connected !== 'boolean'
      || !(typeof deviceId === 'string' || deviceId === null)
      || typeof hasDevice !== 'boolean' || typeof safetyLock !== 'boolean') return null;
    return Object.freeze({ authorityEpoch, capabilityAvailable, connected, deviceId, hasDevice, safetyLock });
  } catch {
    return null;
  }
}

function dispatchDeniedReason(command: RobotCommand, snapshot: RobotCommandPermissionSnapshot): string | null {
  if (!snapshot.capabilityAvailable) return 'capability gate closed';
  if (!snapshot.hasDevice || snapshot.deviceId !== command.deviceId) return 'device binding rejected';
  if (!snapshot.connected) return 'device connection unavailable';
  if (snapshot.safetyLock) return 'safety lock enabled';
  return null;
}

function finalPermissionDeniedReason(
  command: RobotCommand,
  initial: RobotCommandPermissionSnapshot,
  options: RobotCommandCoordinatorOptions,
  capability: RobotCapability,
): string | null {
  let current: RobotCommandPermissionSnapshot;
  try {
    const nextSnapshot = normalizePermissionSnapshot(options.readPermission(capability));
    if (!nextSnapshot) return 'final permission snapshot invalid';
    current = nextSnapshot;
  } catch {
    return 'final permission snapshot unavailable';
  }
  const dispatchReason = dispatchDeniedReason(command, current);
  if (dispatchReason) return `final permission review failed: ${dispatchReason}`;
  if (current.authorityEpoch !== initial.authorityEpoch) return 'final permission review failed: authority changed';
  return null;
}

function rejectedAttempt(
  command: RobotCommandIdentity,
  attemptId: string,
  reason: string,
  status: RobotCommandStatus = 'failed',
): RobotCommandAttempt {
  const state = stateFor(command, attemptId, status, reason);
  return Object.freeze({
    attemptId,
    cancel: () => undefined,
    state: () => state,
    subscribe: (listener: (state: RobotCommandAttemptState) => void) => {
      notifyListener(listener, state);
      return () => undefined;
    },
  });
}

function stateFor(
  command: RobotCommandIdentity,
  attemptId: string,
  status: RobotCommandStatus,
  reason?: string,
): RobotCommandAttemptState {
  return Object.freeze({
    attemptId,
    capability: command.capability,
    commandId: command.commandId,
    deadlineMs: command.deadlineMs,
    deviceId: command.deviceId,
    ...(reason ? { reason } : {}),
    status,
  });
}

function errorReason(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function notifyListener(
  listener: (state: RobotCommandAttemptState) => void,
  state: RobotCommandAttemptState,
) {
  try {
    listener(state);
  } catch {
    // UI observers must never change command state or block terminal cleanup.
  }
}
