// @ts-nocheck -- Executed directly by Node with TypeScript type stripping.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  createRobotCommandCoordinator,
  inspectRobotCommandSupport,
  type RobotCommandAck,
  type RobotCommandExecutor,
  type RobotCommandPermissionSnapshot,
} from '../src/features/robot-lifecycle/robotCommandExecutor.ts';

class ControlledClock {
  private currentMs = 1_000;
  private nextId = 1;
  private readonly timers = new Map<number, { atMs: number; callback: () => void }>();

  now = () => this.currentMs;

  setTimeout = (callback: () => void, delayMs: number) => {
    const id = this.nextId++;
    this.timers.set(id, { atMs: this.currentMs + delayMs, callback });
    return id;
  };

  clearTimeout = (id: unknown) => {
    this.timers.delete(id as number);
  };

  jumpWithoutRunningTimers(ms: number) {
    this.currentMs += ms;
  }

  advance(ms: number) {
    this.currentMs += ms;
    for (;;) {
      const due = [...this.timers.entries()]
        .filter(([, timer]) => timer.atMs <= this.currentMs)
        .sort((left, right) => left[1].atMs - right[1].atMs)[0];
      if (!due) return;
      this.timers.delete(due[0]);
      due[1].callback();
    }
  }
}

const flush = () => new Promise<void>((resolve) => queueMicrotask(resolve));

function permission(overrides: Partial<RobotCommandPermissionSnapshot> = {}): RobotCommandPermissionSnapshot {
  return {
    authorityEpoch: 7,
    capabilityAvailable: true,
    connected: true,
    deviceId: 'robot-1',
    hasDevice: true,
    safetyLock: false,
    ...overrides,
  };
}

function fixture(options: {
  executor?: RobotCommandExecutor | null;
  permission?: RobotCommandPermissionSnapshot;
} = {}) {
  const clock = new ControlledClock();
  let currentPermission = options.permission ?? permission();
  let calls = 0;
  const acknowledgeCallbacks: Array<(ack: RobotCommandAck) => void> = [];
  let latestAck: ((ack: RobotCommandAck) => void) | null = null;
  let latestSignal: AbortSignal | null = null;
  const executor = options.executor === undefined ? {
    supports: () => true,
    execute: (_command, context) => {
      calls += 1;
      latestAck = context.acknowledge;
      acknowledgeCallbacks.push(context.acknowledge);
      latestSignal = context.signal;
    },
  } satisfies RobotCommandExecutor : options.executor;
  let sequence = 0;
  const coordinator = createRobotCommandCoordinator({
    clock,
    executor,
    readPermission: () => currentPermission,
    createAttemptId: () => `attempt-${++sequence}`,
  });

  return {
    clock,
    coordinator,
    calls: () => calls,
    latestSignal: () => latestSignal,
    ack: (ack: RobotCommandAck) => latestAck?.(ack),
    ackAt: (index: number, ack: RobotCommandAck) => acknowledgeCallbacks[index]?.(ack),
    setPermission: (next: RobotCommandPermissionSnapshot) => { currentPermission = next; },
  };
}

const command = (overrides: Partial<{ capability: 'routeStart' | 'taskStart'; commandId: string; deadlineMs: number; deviceId: string }> = {}) => ({
  capability: 'routeStart' as const,
  commandId: 'command-1',
  deadlineMs: 2_000,
  deviceId: 'robot-1',
  payload: Object.freeze({ routeId: 'route-1' }),
  ...overrides,
});

function authenticatedAck(handle: { attemptId: string }, status: RobotCommandAck['status'], overrides: Partial<RobotCommandAck> = {}): RobotCommandAck {
  return {
    attemptId: handle.attemptId,
    authenticated: true,
    commandId: 'command-1',
    deviceId: 'robot-1',
    status,
    ...overrides,
  };
}

test('closed capability gate never calls executor', () => {
  const f = fixture({ permission: permission({ capabilityAvailable: false }) });
  const handle = f.coordinator.dispatch(command());
  assert.equal(handle.state().status, 'failed');
  assert.match(handle.state().reason ?? '', /capability/i);
  assert.equal(f.calls(), 0);
});

test('missing or unsupported executor fails closed', () => {
  const missing = fixture({ executor: null });
  assert.equal(missing.coordinator.dispatch(command()).state().status, 'failed');
  assert.equal(missing.calls(), 0);

  let executeCalls = 0;
  const unsupported = fixture({ executor: { supports: () => false, execute: () => { executeCalls += 1; } } });
  assert.equal(unsupported.coordinator.dispatch(command()).state().status, 'failed');
  assert.equal(executeCalls, 0);
});

test('both capability and executor gates call transport exactly once and deduplicate an in-flight capability', () => {
  const f = fixture();
  const first = f.coordinator.dispatch(command());
  const duplicate = f.coordinator.dispatch(command({ commandId: 'command-duplicate' }));
  assert.equal(first, duplicate);
  assert.equal(first.state().status, 'submitting');
  assert.equal(f.calls(), 1);
});

test('dispatch snapshots and freezes command identity, deadline, capability, device, and nested payload', () => {
  const clock = new ControlledClock();
  let deliveredCommand: any = null;
  let acknowledge: ((ack: RobotCommandAck) => void) | null = null;
  const coordinator = createRobotCommandCoordinator({
    clock,
    createAttemptId: () => 'attempt-snapshot',
    readPermission: () => permission(),
    executor: {
      supports: () => true,
      execute: (nextCommand, context) => {
        deliveredCommand = nextCommand;
        acknowledge = context.acknowledge;
      },
    },
  });
  const original: any = {
    ...command(),
    payload: { route: { id: 'route-1' } },
  };
  const handle = coordinator.dispatch(original);

  original.capability = 'taskStart';
  original.commandId = 'mutated-command';
  original.deadlineMs = 999_999;
  original.deviceId = 'mutated-device';
  original.payload.route.id = 'mutated-route';

  assert.notEqual(deliveredCommand, original);
  assert.deepEqual(JSON.parse(JSON.stringify(deliveredCommand)), {
    capability: 'routeStart',
    commandId: 'command-1',
    deadlineMs: 2_000,
    deviceId: 'robot-1',
    payload: { route: { id: 'route-1' } },
  });
  assert.equal(Object.isFrozen(deliveredCommand), true);
  assert.equal(Object.isFrozen(deliveredCommand.payload), true);
  assert.equal(Object.isFrozen(deliveredCommand.payload.route), true);
  assert.throws(() => { deliveredCommand.commandId = 'adapter-mutated'; }, TypeError);
  assert.throws(() => { deliveredCommand.payload.route.id = 'adapter-mutated'; }, TypeError);

  acknowledge?.({
    attemptId: handle.attemptId,
    authenticated: true,
    commandId: 'command-1',
    deviceId: 'robot-1',
    status: 'accepted',
  });
  assert.equal(handle.state().status, 'accepted');
  assert.equal(handle.state().commandId, 'command-1');
  assert.equal(handle.state().deadlineMs, 2_000);
  assert.equal(handle.state().deviceId, 'robot-1');
});

test('payload cloning treats prototype-pollution keys as inert own data', () => {
  let deliveredPayload: any = null;
  const f = fixture({
    executor: {
      supports: () => true,
      execute: (nextCommand) => { deliveredPayload = nextCommand.payload; },
    },
  });
  const hostilePayload = JSON.parse('{"__proto__":{"routeId":"attacker"},"safe":"value"}');
  const handle = f.coordinator.dispatch({ ...command(), payload: hostilePayload });
  assert.equal(handle.state().status, 'submitting');
  assert.equal(Object.getPrototypeOf(deliveredPayload), null);
  assert.equal(Object.prototype.hasOwnProperty.call(deliveredPayload, '__proto__'), true);
  assert.equal(deliveredPayload.__proto__.routeId, 'attacker');
  assert.equal(deliveredPayload.routeId, undefined);
  assert.equal('routeId' in deliveredPayload, false);
  assert.equal((Object.prototype as any).routeId, undefined);
});

test('unsupported and cyclic payloads fail closed before transport execution', () => {
  for (const [payload, reason] of [
    [{ callback: () => undefined }, /unsupported command payload type: function/],
    [Object.assign(Object.create({ inherited: true }), { routeId: 'route-1' }), /plain prototype/],
  ] as const) {
    let executeCalls = 0;
    const f = fixture({ executor: { supports: () => true, execute: () => { executeCalls += 1; } } });
    const handle = f.coordinator.dispatch({ ...command(), payload });
    assert.equal(handle.state().status, 'failed');
    assert.match(handle.state().reason ?? '', reason);
    assert.equal(executeCalls, 0);
  }

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  let executeCalls = 0;
  const f = fixture({ executor: { supports: () => true, execute: () => { executeCalls += 1; } } });
  const handle = f.coordinator.dispatch({ ...command(), payload: cyclic });
  assert.equal(handle.state().status, 'failed');
  assert.match(handle.state().reason ?? '', /cyclic command payload/);
  assert.equal(executeCalls, 0);
});

test('support inspection distinguishes executor faults from ordinary unsupported capabilities', () => {
  assert.deepEqual(inspectRobotCommandSupport(null, 'routeStart'), {
    reason: 'executor unavailable',
    state: 'unavailable',
    supported: false,
  });
  assert.deepEqual(inspectRobotCommandSupport({ supports: () => false, execute: () => undefined }, 'routeStart'), {
    reason: 'executor does not support capability',
    state: 'unsupported',
    supported: false,
  });
  const secretLikeMessage = 'endpoint=https://internal.invalid token=super-secret';
  const fault = inspectRobotCommandSupport({ supports: () => { throw new Error(secretLikeMessage); }, execute: () => undefined }, 'routeStart');
  assert.deepEqual(fault, {
    reason: '命令执行器故障，未下发',
    state: 'fault',
    supported: false,
  });
  assert.doesNotMatch(JSON.stringify(fault), /internal|super-secret/);

  for (const invalid of ['true', 1, {}]) {
    assert.deepEqual(inspectRobotCommandSupport({ supports: () => invalid as any, execute: () => undefined }, 'routeStart'), {
      reason: '命令执行器故障，未下发',
      state: 'fault',
      supported: false,
    });
  }
});

test('App surfaces executor support faults distinctly while the production executor remains null', () => {
  const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  assert.match(appSource, /PRODUCTION_ROBOT_COMMAND_EXECUTOR[^=]*= null/);
  assert.match(appSource, /inspectRobotCommandSupport\(PRODUCTION_ROBOT_COMMAND_EXECUTOR, capability\)/);
  assert.match(appSource, /executorSupport\.state === 'fault'/);
  assert.match(appSource, /命令执行器故障，未下发/);
  assert.doesNotMatch(appSource, /executorSupport\.reason/);
  assert.doesNotMatch(appSource, /catch\s*\{\s*return false;\s*\}/);
});

test('local dispatch stays submitting until a trusted device ACK accepts it', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  assert.equal(handle.state().status, 'submitting');
  f.ack(authenticatedAck(handle, 'accepted', { authenticated: false }));
  assert.equal(handle.state().status, 'submitting');
  f.ack(authenticatedAck(handle, 'accepted'));
  assert.equal(handle.state().status, 'accepted');
});

test('attempt subscriptions reliably publish submitting, accepted, executing, and terminal changes', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  const statuses: string[] = [];
  const unsubscribe = handle.subscribe((state) => statuses.push(state.status));
  f.ack(authenticatedAck(handle, 'accepted'));
  f.ack(authenticatedAck(handle, 'executing'));
  f.ack(authenticatedAck(handle, 'succeeded'));
  unsubscribe();
  assert.deepEqual(statuses, ['submitting', 'accepted', 'executing', 'succeeded']);
});

test('late subscribers receive transition history even after synchronous terminal ACKs', () => {
  let acknowledge: ((ack: RobotCommandAck) => void) | null = null;
  const clock = new ControlledClock();
  const coordinator = createRobotCommandCoordinator({
    clock,
    createAttemptId: () => 'attempt-sync',
    readPermission: () => permission(),
    executor: {
      supports: () => true,
      execute: (nextCommand, context) => {
        acknowledge = context.acknowledge;
        context.acknowledge({
          attemptId: context.attemptId,
          authenticated: true,
          commandId: nextCommand.commandId,
          deviceId: nextCommand.deviceId,
          status: 'executing',
        });
        context.acknowledge({
          attemptId: context.attemptId,
          authenticated: true,
          commandId: nextCommand.commandId,
          deviceId: nextCommand.deviceId,
          status: 'succeeded',
        });
      },
    },
  });
  const handle = coordinator.dispatch(command());
  const statuses: string[] = [];
  handle.subscribe((state) => statuses.push(state.status));
  assert.ok(acknowledge);
  assert.deepEqual(statuses, ['submitting', 'executing', 'succeeded']);
});

test('dispatch rechecks binding, connection, and safety immediately before transport', () => {
  for (const denied of [
    permission({ hasDevice: false }),
    permission({ deviceId: 'robot-other' }),
    permission({ connected: false }),
    permission({ safetyLock: true }),
  ]) {
    const f = fixture({ permission: denied });
    assert.equal(f.coordinator.dispatch(command()).state().status, 'failed');
    assert.equal(f.calls(), 0);
  }
});

test('permission is re-read after executor support negotiation and before dispatch', () => {
  const clock = new ControlledClock();
  let currentPermission = permission();
  let executeCalls = 0;
  const coordinator = createRobotCommandCoordinator({
    clock,
    createAttemptId: () => 'attempt-race',
    readPermission: () => currentPermission,
    executor: {
      supports: () => {
        currentPermission = permission({ safetyLock: true });
        return true;
      },
      execute: () => { executeCalls += 1; },
    },
  });
  assert.equal(coordinator.dispatch(command()).state().status, 'failed');
  assert.equal(executeCalls, 0);
});

test('deadline aborts execution, expires the attempt, and ignores late success', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  assert.equal(f.latestSignal()?.aborted, false);
  f.clock.advance(1_000);
  assert.equal(f.latestSignal()?.aborted, true);
  assert.equal(handle.state().status, 'expired');
  f.ack(authenticatedAck(handle, 'succeeded'));
  assert.equal(handle.state().status, 'expired');
});

test('absolute deadline rejects success even when the timer callback is delayed', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  f.clock.jumpWithoutRunningTimers(1_000);
  f.ack(authenticatedAck(handle, 'succeeded'));
  assert.equal(handle.state().status, 'expired');
  assert.equal(f.latestSignal()?.aborted, true);
});

test('old attempt ACK cannot affect a new attempt', () => {
  const f = fixture();
  const oldHandle = f.coordinator.dispatch(command());
  oldHandle.cancel();
  const freshHandle = f.coordinator.dispatch(command({ commandId: 'command-2', deadlineMs: 3_000 }));
  f.ackAt(0, authenticatedAck(oldHandle, 'succeeded'));
  assert.equal(freshHandle.state().status, 'submitting');
  assert.equal(f.calls(), 2);
});

test('an old attempt ID sent through the current callback cannot affect the new attempt', () => {
  const f = fixture();
  const oldHandle = f.coordinator.dispatch(command());
  oldHandle.cancel();
  const freshHandle = f.coordinator.dispatch(command({ commandId: 'command-2', deadlineMs: 3_000 }));
  f.ackAt(1, authenticatedAck(oldHandle, 'succeeded', { commandId: 'command-2' }));
  assert.equal(freshHandle.state().status, 'submitting');
});

test('only authenticated matching current ACKs advance status; rejected maps safely to failed', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  for (const invalid of [
    authenticatedAck(handle, 'executing', { authenticated: false }),
    authenticatedAck(handle, 'executing', { commandId: 'wrong' }),
    authenticatedAck(handle, 'executing', { deviceId: 'wrong' }),
    authenticatedAck(handle, 'executing', { attemptId: 'wrong' }),
  ]) f.ack(invalid);
  assert.equal(handle.state().status, 'submitting');
  f.ack(authenticatedAck(handle, 'executing'));
  assert.equal(handle.state().status, 'executing');
  f.ack(authenticatedAck(handle, 'rejected', { reason: 'device policy rejected' }));
  assert.equal(handle.state().status, 'failed');
  assert.equal(handle.state().reason, 'device policy rejected');
});

test('unknown and illegal ACK statuses are ignored without clearing the active attempt', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  f.ack(authenticatedAck(handle, 'unknown-runtime-status' as RobotCommandAck['status']));
  assert.equal(handle.state().status, 'submitting');
  assert.equal(f.coordinator.dispatch(command({ commandId: 'duplicate' })), handle);

  f.ack(authenticatedAck(handle, 'executing'));
  assert.equal(handle.state().status, 'executing');
  f.ack(authenticatedAck(handle, 'accepted'));
  assert.equal(handle.state().status, 'executing');
  f.ack(authenticatedAck(handle, 'succeeded'));
  assert.equal(handle.state().status, 'succeeded');
});

test('malformed ACK envelopes and truthy authentication values cannot advance or clear an attempt', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  f.ack(null as any);
  f.ack(authenticatedAck(handle, 'accepted', { authenticated: 'false' as any }));
  f.ack(authenticatedAck(handle, 'accepted', { attemptId: 7 as any }));
  f.ack(authenticatedAck(handle, 'accepted', { commandId: {} as any }));
  f.ack(authenticatedAck(handle, 'accepted', { deviceId: null as any }));
  assert.equal(handle.state().status, 'submitting');
  assert.equal(f.coordinator.dispatch(command({ commandId: 'duplicate' })), handle);
  f.ack(authenticatedAck(handle, 'accepted'));
  assert.equal(handle.state().status, 'accepted');
});

test('ACK accessors and inherited binding fields are rejected before state-machine reads', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  let statusReads = 0;
  const accessorAck = authenticatedAck(handle, 'accepted') as any;
  Object.defineProperty(accessorAck, 'status', { enumerable: true, get: () => (++statusReads === 1 ? 'accepted' : 'succeeded') });
  f.ack(accessorAck);
  f.ack(Object.create(authenticatedAck(handle, 'succeeded')) as any);
  assert.equal(statusReads, 0);
  assert.equal(handle.state().status, 'submitting');
  assert.equal(f.coordinator.dispatch(command({ commandId: 'duplicate' })), handle);
});

test('permission snapshots are immutable and malformed boolean-like gates fail closed', () => {
  const mutablePermission: any = permission();
  const f = fixture({ permission: mutablePermission });
  const handle = f.coordinator.dispatch(command());
  mutablePermission.authorityEpoch = 8;
  f.ack(authenticatedAck(handle, 'succeeded'));
  assert.equal(handle.state().status, 'failed');
  assert.match(handle.state().reason ?? '', /authority changed/);

  let executeCalls = 0;
  const invalid = fixture({
    executor: { supports: () => true, execute: () => { executeCalls += 1; } },
    permission: permission({ capabilityAvailable: 'false' as any }),
  });
  const invalidHandle = invalid.coordinator.dispatch(command());
  assert.equal(invalidHandle.state().status, 'failed');
  assert.match(invalidHandle.state().reason ?? '', /permission snapshot invalid/);
  assert.equal(executeCalls, 0);

  let capabilityReads = 0;
  const accessorPermission: any = permission();
  Object.defineProperty(accessorPermission, 'capabilityAvailable', {
    enumerable: true,
    get: () => { capabilityReads += 1; return true; },
  });
  for (const malformedPermission of [accessorPermission, Object.create(permission())]) {
    let malformedExecuteCalls = 0;
    const malformed = fixture({
      executor: { supports: () => true, execute: () => { malformedExecuteCalls += 1; } },
      permission: malformedPermission,
    });
    const malformedHandle = malformed.coordinator.dispatch(command());
    assert.equal(malformedHandle.state().status, 'failed');
    assert.match(malformedHandle.state().reason ?? '', /permission snapshot invalid/);
    assert.equal(malformedExecuteCalls, 0);
  }
  assert.equal(capabilityReads, 0);
});

test('unauthenticated or mismatched succeeded ACKs cannot display success', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  for (const invalid of [
    authenticatedAck(handle, 'succeeded', { authenticated: false }),
    authenticatedAck(handle, 'succeeded', { commandId: 'wrong' }),
    authenticatedAck(handle, 'succeeded', { deviceId: 'wrong' }),
    authenticatedAck(handle, 'succeeded', { attemptId: 'wrong' }),
  ]) f.ack(invalid);
  assert.equal(handle.state().status, 'submitting');
});

test('cancellation is terminal and aborts transport', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  handle.cancel();
  assert.equal(handle.state().status, 'cancelled');
  assert.equal(f.latestSignal()?.aborted, true);
  f.ack(authenticatedAck(handle, 'succeeded'));
  assert.equal(handle.state().status, 'cancelled');
});

test('success is terminal only after final permission review', () => {
  for (const changed of [
    permission({ safetyLock: true }),
    permission({ authorityEpoch: 8 }),
    permission({ connected: false }),
    permission({ capabilityAvailable: false }),
  ]) {
    const f = fixture();
    const handle = f.coordinator.dispatch(command());
    f.ack(authenticatedAck(handle, 'executing'));
    f.setPermission(changed);
    f.ack(authenticatedAck(handle, 'succeeded'));
    assert.equal(handle.state().status, 'failed');
    assert.notEqual(handle.state().status, 'succeeded');
  }

  const valid = fixture();
  const handle = valid.coordinator.dispatch(command());
  valid.ack(authenticatedAck(handle, 'executing'));
  valid.ack(authenticatedAck(handle, 'succeeded'));
  assert.equal(handle.state().status, 'succeeded');
});

test('executor exceptions and rejected promises fail without reviving after timeout', async () => {
  const thrown = fixture({ executor: { supports: () => true, execute: () => { throw new Error('transport threw'); } } });
  assert.equal(thrown.coordinator.dispatch(command()).state().status, 'failed');

  const rejected = fixture({ executor: { supports: () => true, execute: async () => { throw new Error('transport rejected'); } } });
  const handle = rejected.coordinator.dispatch(command());
  await flush();
  assert.equal(handle.state().status, 'failed');
});

test('observer failures cannot block terminal cleanup or the next dispatch', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  assert.doesNotThrow(() => handle.subscribe(() => { throw new Error('observer failed'); }));
  assert.doesNotThrow(() => f.ack(authenticatedAck(handle, 'succeeded')));
  assert.equal(handle.state().status, 'succeeded');
  const next = f.coordinator.dispatch(command({ commandId: 'command-2', deadlineMs: 3_000 }));
  assert.equal(next.state().status, 'submitting');
  assert.equal(f.calls(), 2);
});

test('a terminal observer can start the next command without old cleanup deleting it', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  let next: ReturnType<typeof f.coordinator.dispatch> | null = null;
  handle.subscribe((state) => {
    if (state.status === 'succeeded') {
      next = f.coordinator.dispatch(command({ commandId: 'command-next', deadlineMs: 3_000 }));
    }
  });
  f.ack(authenticatedAck(handle, 'succeeded'));
  assert.ok(next);
  f.ack(authenticatedAck(next, 'succeeded', { commandId: 'command-next' }));
  assert.equal(next.state().status, 'succeeded');
});

test('authority invalidation can cancel every active capability before a new session dispatches', () => {
  const f = fixture();
  const route = f.coordinator.dispatch(command());
  const task = f.coordinator.dispatch(command({ capability: 'taskStart', commandId: 'command-task' }));
  f.coordinator.cancelAll('command authority changed');
  assert.equal(route.state().status, 'cancelled');
  assert.equal(task.state().status, 'cancelled');
  const next = f.coordinator.dispatch(command({ commandId: 'command-next', deadlineMs: 3_000 }));
  assert.equal(next.state().status, 'submitting');
  assert.equal(f.calls(), 3);
});

test('cancelAll rejects observer re-entrant dispatch until authority invalidation finishes', () => {
  const f = fixture();
  const handle = f.coordinator.dispatch(command());
  let reentrant: ReturnType<typeof f.coordinator.dispatch> | null = null;
  handle.subscribe((state) => {
    if (state.status === 'cancelled') {
      reentrant = f.coordinator.dispatch(command({ commandId: 'reentrant-command', deadlineMs: 3_000 }));
    }
  });

  f.coordinator.cancelAll('command authority changed');
  assert.ok(reentrant);
  assert.equal(reentrant.state().status, 'failed');
  assert.match(reentrant.state().reason ?? '', /invalidation in progress/);
  assert.equal(f.calls(), 1);

  const explicit = f.coordinator.dispatch(command({ commandId: 'explicit-command', deadlineMs: 3_000 }));
  assert.equal(explicit.state().status, 'submitting');
  assert.equal(f.calls(), 2);
});
