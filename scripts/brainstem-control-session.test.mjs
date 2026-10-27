import assert from 'node:assert/strict';
import test from 'node:test';
import { BrainstemControlSession } from '../src/features/control/brainstemControlSession.ts';

const status = (patch = {}) => ({ fsmKind: 'grounded', transition: 'none', motorOutputEnabled: false,
  owner: 'none', criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: false, ...patch });
function fixture() {
  let at = 1000;
  let current = status();
  let lease = false;
  let verified = false;
  let sequence = 0;
  const calls = [];
  const reply = extra => ({ status: { ...current }, leaseActive: lease, principalVerified: verified, ...extra });
  const transport = {
    async open(endpoint, principal) { calls.push(['open', endpoint.host, principal]); return { ...reply(), sessionId: 's1', transport: 'grpc-mtls', mutualTlsVerified: true, profile: { current: 'flat', available: ['flat', 'stairs'], descriptions: [], currentDescription: '' } }; },
    async read() { calls.push(['read']); return reply(); },
    async action(id, action, profile) {
      calls.push(['action', action, profile]); lease = false; verified = true;
      if (action === 'enable') current.motorOutputEnabled = true;
      if (action === 'disable') current.motorOutputEnabled = false;
      if (action === 'stand-up') current = status({ ...current, fsmKind: 'transitioning', transition: 'stand_up' });
      if (action === 'sit-down') current = status({ ...current, fsmKind: 'transitioning', transition: 'sit_down' });
      return reply();
    },
    async acquire() { calls.push(['acquire']); lease = true; verified = true; sequence = 1;
      current = status({ ...current, owner: 'grpc', grpcLeaseActive: true, readyForWalk: true }); return reply({ sequence }); },
    async input(id, forward, lateral, yaw) { calls.push(['input', forward, lateral, yaw]); return reply({ sequence: ++sequence }); },
    async interrupt() { calls.push(['interrupt']); lease = false; current = status({ ...current, owner: 'none', grpcLeaseActive: false }); return reply(); },
    async close() { calls.push(['close']); },
  };
  const session = new BrainstemControlSession(transport, () => true, () => at);
  return { session, transport, calls, advance(ms) { at += ms; }, set(patch) { current = { ...current, ...patch }; }, reply };
}
const endpoint = { host: '192.0.2.1', port: 13145, clientIdentityAlias: 'fixture' };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('an outstanding motor action keeps its channel while stale telemetry stays unknown and cannot authorize motion', async () => {
  const f = fixture();
  await f.session.connect(endpoint, 'doso-g20@robot');
  let finish;
  f.transport.action = () => new Promise(resolve => { finish = resolve; });
  const action = f.session.action('enable');
  f.advance(1501);
  assert.equal(f.session.runtimeState.controlLink, 'connected');
  assert.equal(f.session.runtimeState.motorState, 'unknown');
  assert.equal(f.session.canAcquire, false);
  assert.equal(f.session.operationReadiness.stand.ready, false);
  f.set({ motorOutputEnabled: true }); finish(f.reply()); await action;
  assert.equal(f.session.runtimeState.motorState, 'enabled');
  f.advance(1501);
  assert.equal(f.session.runtimeState.controlLink, 'disconnected', 'ordinary stale reads still invalidate results');
  f.session.dispose();
});

test('a motor action owns the whole read wait and native transaction without admitting another action, acquire or input', async () => {
  const f = fixture();
  await f.session.connect(endpoint, 'doso-g20@robot');
  let finishRead, finishAction, dispatched = 0;
  f.transport.read = () => new Promise(resolve => { finishRead = () => resolve(f.reply()); });
  const originalAction = f.transport.action;
  f.transport.action = (...args) => { dispatched++; return new Promise(resolve => {
    finishAction = async () => resolve(await originalAction(...args));
  }); };
  const reading = f.session.refresh();
  const action = f.session.action('enable');
  f.advance(1501);
  assert.equal(f.session.state.phase, 'operating');
  assert.equal(f.session.runtimeState.controlLink, 'connected');
  assert.equal(f.session.runtimeState.motorState, 'unknown');
  await assert.rejects(f.session.action('enable'), /上一项操作/);
  await f.session.acquire();
  await f.session.sticks({ x: .5, y: -.5 }, { x: .5, y: 0 });
  assert.equal(dispatched, 0);
  assert.equal(f.calls.some(call => call[0] === 'acquire' || call[0] === 'input'), false);
  finishRead(); await reading; await tick();
  assert.equal(dispatched, 1);
  assert.equal(f.session.state.phase, 'operating', 'read completion cannot retire the action phase');
  f.advance(1501);
  assert.equal(f.session.runtimeState.controlLink, 'connected');
  assert.equal(f.session.runtimeState.motorState, 'unknown');
  assert.equal(f.session.operationReadiness.stand.ready, false);
  await finishAction(); await action;
  assert.equal(f.session.state.phase, 'ready');
  assert.equal(f.session.runtimeState.motorState, 'enabled');
  f.session.dispose();
});

test('interrupt, disconnect and disposal cancel a queued motor action before the old read can dispatch it', async () => {
  for (const cancel of ['interrupt', 'disconnect', 'dispose']) {
    const f = fixture();
    await f.session.connect(endpoint, 'doso-g20@robot');
    let finishRead;
    f.transport.read = () => new Promise(resolve => { finishRead = () => resolve(f.reply()); });
    const reading = f.session.refresh();
    const outcome = f.session.action('enable').then(() => 'sent', () => 'cancelled');
    if (cancel === 'dispose') f.session.dispose(); else await f.session[cancel]();
    finishRead(); await reading;
    assert.equal(await outcome, 'cancelled', cancel);
    assert.equal(f.calls.some(call => call[0] === 'action'), false, cancel);
    assert.equal(f.calls.some(call => call[0] === 'interrupt'), true, 'native work is cancelled even without an existing lease');
    f.session.dispose();
  }
});

test('a queued action rechecks the returned device state without disconnecting a valid channel on precondition failure', async () => {
  const f = fixture();
  await f.session.connect(endpoint, 'doso-g20@robot');
  let finishRead;
  f.transport.read = () => new Promise(resolve => { finishRead = () => resolve(f.reply()); });
  const reading = f.session.refresh();
  const action = f.session.action('enable');
  const rejected = assert.rejects(action, /机器狗当前状态不允许/);
  f.set({ criticalMotorFault: true }); finishRead(); await reading; await rejected;
  assert.equal(f.calls.some(call => call[0] === 'action'), false);
  assert.equal(f.session.state.connected, true);
  assert.equal(f.session.state.phase, 'ready');
  assert.equal(f.session.operationReadiness.enableMotor.ready, false);
  f.session.dispose();
});

test('a cancelled queued action cannot release the replacement action transaction', async () => {
  const f = fixture();
  await f.session.connect(endpoint, 'doso-g20@robot');
  let finishRead, finishAction;
  f.transport.read = () => new Promise(resolve => { finishRead = () => resolve(f.reply()); });
  const reading = f.session.refresh();
  const first = f.session.action('enable').then(() => 'sent', () => 'cancelled');
  await f.session.interrupt();
  const originalAction = f.transport.action;
  f.transport.action = (...args) => new Promise(resolve => { finishAction = async () => resolve(await originalAction(...args)); });
  const second = f.session.action('enable');
  finishRead(); await reading; await tick();
  assert.equal(await first, 'cancelled');
  assert.equal(f.session.state.phase, 'operating');
  await assert.rejects(f.session.action('enable'), /上一项操作/);
  await finishAction(); await second;
  assert.equal(f.calls.filter(call => call[0] === 'action').length, 1);
  assert.equal(f.session.runtimeState.motorState, 'enabled');
  f.session.dispose();
});

test('synchronous cancellation during the dispatch notification prevents the native motor action', async () => {
  for (const cancel of ['interrupt', 'disconnect']) {
    const f = fixture();
    await f.session.connect(endpoint, 'doso-g20@robot');
    let operating = 0, cancelling;
    const unsubscribe = f.session.subscribe(() => {
      if (f.session.state.phase === 'operating' && ++operating === 2) cancelling = f.session[cancel]();
    });
    await assert.rejects(f.session.action('enable'), /控制连接已变化/);
    await cancelling;
    assert.equal(f.calls.some(call => call[0] === 'action'), false, cancel);
    assert.equal(f.calls.some(call => call[0] === 'interrupt'), true, cancel);
    unsubscribe(); f.session.dispose();
  }
});

test('status freshness is rechecked after the dispatch notification', async () => {
  const f = fixture();
  await f.session.connect(endpoint, 'doso-g20@robot');
  let operating = 0;
  const unsubscribe = f.session.subscribe(() => {
    if (f.session.state.phase === 'operating' && ++operating === 2) f.advance(1501);
  });
  await assert.rejects(f.session.action('enable'), /机器狗当前状态不允许/);
  assert.equal(f.calls.some(call => call[0] === 'action'), false);
  unsubscribe(); f.session.dispose();
});

test('completed connect, acquire and interrupt notifications cannot release a newly started action transaction', async () => {
  for (const previous of ['connect', 'acquire', 'interrupt']) {
    const f = fixture();
    if (previous !== 'connect') {
      await f.session.connect(endpoint, 'doso-g20@robot');
      f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
      if (previous === 'interrupt') await f.session.acquire();
    }
    let started = false, finishAction, pending, dispatched = 0;
    const originalAction = f.transport.action;
    f.transport.action = (...args) => { dispatched++; return new Promise(resolve => {
      finishAction = async () => resolve(await originalAction(...args));
    }); };
    const actionName = previous === 'connect' ? 'enable' : 'disable';
    const unsubscribe = f.session.subscribe(() => {
      const completed = previous === 'acquire' ? f.session.state.phase === 'armed' : f.session.state.phase === 'ready';
      if (completed && !started) { started = true; pending = f.session.action(actionName); }
    });
    if (previous === 'connect') await f.session.connect(endpoint, 'doso-g20@robot'); else await f.session[previous]();
    assert.equal(dispatched, 1, previous);
    assert.equal(f.session.state.phase, 'operating', previous);
    assert.equal(f.session.canAcquire, false, previous);
    assert.equal(f.session.canUseManualControl, false, previous);
    await assert.rejects(f.session.action(actionName), /上一项操作/, previous);
    assert.equal(dispatched, 1, previous);
    await finishAction(); await pending;
    unsubscribe(); f.session.dispose();
  }
});

test('explicit LAN channel retains lease ACK safety without claiming authenticated principal or automatically moving', async () => {
  const f = fixture();
  const originalOpen = f.transport.open;
  f.transport.open = async (...args) => ({ ...await originalOpen(...args), transport: 'grpc-lan', mutualTlsVerified: false, clientIdentitySelected: false, leaseOwnerMatched: false });
  for (const name of ['read', 'action', 'acquire', 'input', 'interrupt']) {
    const original = f.transport[name];
    f.transport[name] = async (...args) => { const reply = await original(...args); return { ...reply, principalVerified: false, leaseOwnerMatched: reply.leaseActive }; };
  }
  assert.equal(await f.session.connect({ host: '192.168.42.64', port: 13145, transport: 'lan-dev' }, ''), true);
  assert.equal(f.session.state.transport, 'grpc-lan'); assert.equal(f.session.state.mutualTlsVerified, false);
  assert.equal(f.session.state.principalVerified, false); assert.equal(f.calls.length, 1);
  await f.session.action('enable'); f.set({ fsmKind: 'standing', transition: 'none' }); await f.session.refresh();
  await f.session.acquire();
  assert.equal(f.session.canUseManualControl, true); assert.equal(f.session.state.leaseOwnerMatched, true);
  assert.equal(f.session.state.principalVerified, false);
  const input = f.transport.input;
  f.transport.input = async (...args) => ({ ...await input(...args), leaseOwnerMatched: false });
  await f.session.drive({ x: 0, y: -0.5 });
  assert.equal(f.session.state.connected, false, 'wrong owner ACK retires the channel');
  assert.equal(f.session.canUseManualControl, false);
  f.session.dispose();
});

test('TLS cannot acquire or retain a lease solely from an owner match without authenticated principal', async () => {
  for (const stage of ['acquire', 'input', 'read']) {
    const f = fixture();
    await f.session.connect(endpoint, 'doso-g20@robot');
    await f.session.action('enable'); f.set({ fsmKind: 'standing', transition: 'none' }); await f.session.refresh();
    const original = f.transport[stage];
    f.transport[stage] = async (...args) => ({ ...await original(...args), principalVerified: false, leaseOwnerMatched: true });
    if (stage === 'acquire') await f.session.acquire();
    else {
      await f.session.acquire();
      if (stage === 'input') await f.session.drive({ x: 0, y: -0.5 });
      else await f.session.refresh();
    }
    assert.equal(f.session.state.connected, false, stage);
    assert.equal(f.session.canUseManualControl, false, stage);
    f.session.dispose();
  }
});

test('concurrent stop callers await the same unconfirmed result without a hidden retry', async () => {
  const f = fixture();
  await f.session.connect(endpoint, 'doso-g20@robot');
  await f.session.action('enable');
  f.set({ fsmKind: 'standing', transition: 'none' });
  await f.session.refresh(); await f.session.acquire();
  let rejectStop, attempts = 0;
  const stopped = new Promise((resolve, reject) => { rejectStop = reject; });
  f.transport.interrupt = () => { attempts++; return stopped; };
  const first = f.session.interrupt();
  const second = f.session.interrupt();
  rejectStop({ code: 'stop_unconfirmed' });
  const results = await Promise.allSettled([first, second]);
  assert.deepEqual(results.map(result => result.status), ['rejected', 'rejected']);
  assert.equal(attempts, 1, 'an unconfirmed stop is not silently retried during cleanup');
  assert.match(f.session.state.error, /停止请求未确认/);
  assert.equal(f.session.state.connected, false);
  assert.equal(f.session.state.leaseActive, false);
  await assert.rejects(f.session.interrupt(), /停止请求未确认/, 'another diagnostics click cannot turn unknown stop into success');
  assert.equal(attempts, 1);
  await f.session.disconnect();
  assert.match(f.session.state.error, /停止请求未确认/, 'background cleanup cannot erase an unresolved stop');
  await assert.rejects(f.session.interrupt(), /停止请求未确认/);
  f.session.dispose();
});

test('cleanup stop failure remains visible until an explicitly verified reconnect succeeds', async () => {
  const f = fixture();
  await f.session.connect(endpoint, 'doso-g20@robot');
  f.transport.interrupt = async () => { throw { code: 'stop_unconfirmed' }; };
  await f.session.disconnect();
  assert.match(f.session.state.error, /停止请求未确认/);
  await f.session.disconnect();
  assert.match(f.session.state.error, /停止请求未确认/);
  const open = f.transport.open;
  f.transport.open = async () => { throw Error('network'); };
  assert.equal(await f.session.connect(endpoint, 'doso-g20@robot'), false);
  assert.match(f.session.state.error, /停止请求未确认/);
  f.transport.open = open;
  assert.equal(await f.session.connect(endpoint, 'doso-g20@robot'), true);
  assert.equal(f.session.state.error, null);
  f.session.dispose();
});

test('status-failure cleanup records an unconfirmed stop, not only the network error', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  f.transport.read = async () => { throw { code: 'unavailable' }; };
  f.transport.interrupt = async () => { throw { code: 'stop_unconfirmed' }; };
  await f.session.refresh();
  assert.match(f.session.state.error, /停止请求未确认/);
  await f.session.disconnect(); assert.match(f.session.state.error, /停止请求未确认/);
  f.session.dispose();
});

test('a failed replacement open retains the previous connection stop warning', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  f.transport.interrupt = async () => { throw { code: 'stop_unconfirmed' }; };
  f.transport.open = async () => { throw { code: 'unavailable' }; };
  assert.equal(await f.session.connect({ ...endpoint, host: '192.0.2.2' }, 'doso-g20@robot'), false);
  assert.match(f.session.state.error, /停止请求未确认/);
  f.session.dispose();
});

test('repeated disconnects retain late stop failure, while a new verified connection retires it', async () => {
  for (const replace of [false, true]) {
    const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
    let rejectStop;
    f.transport.interrupt = () => new Promise((resolve, reject) => { rejectStop = reject; });
    const closing = f.session.disconnect();
    await f.session.disconnect();
    if (replace) assert.equal(await f.session.connect({ ...endpoint, host: '192.0.2.2' }, 'doso-g20@robot'), true);
    rejectStop({ code: 'stop_unconfirmed' }); await closing;
    if (replace) { assert.equal(f.session.state.error, null); assert.equal(f.session.state.connected, true); }
    else assert.match(f.session.state.error, /停止请求未确认/);
    f.transport.interrupt = async () => f.reply();
    await f.session.disconnect(); f.session.dispose();
  }
});

test('an old stop completion cannot clear the pending stop of a replacement session', async () => {
  const f = fixture();
  await f.session.connect(endpoint, 'doso-g20@robot');
  await f.session.action('enable'); f.set({ fsmKind: 'standing', transition: 'none' });
  await f.session.refresh(); await f.session.acquire();
  const originalStop = f.transport.interrupt;
  let firstResolve, nextResolve, attempts = 0;
  f.transport.interrupt = () => {
    attempts++;
    if (attempts === 1) return new Promise(resolve => { firstResolve = resolve; });
    if (attempts === 3) return new Promise(resolve => { nextResolve = resolve; });
    return originalStop();
  };
  const old = f.session.interrupt();
  await f.session.disconnect();
  const originalOpen = f.transport.open;
  f.transport.open = async (...args) => ({ ...await originalOpen(...args), principalVerified: false, leaseActive: false });
  assert.equal(await f.session.connect({ ...endpoint, host: '192.0.2.2' }, 'doso-g20@robot'), true);
  await f.session.acquire();
  const current = f.session.interrupt();
  assert.equal(attempts, 3);
  firstResolve(f.reply()); await old;
  const duplicate = f.session.interrupt();
  assert.equal(duplicate, current);
  assert.equal(attempts, 3, 'old finally does not retire the replacement stop');
  nextResolve(await originalStop()); await current;
  await f.session.disconnect();
});

test('operator directions follow Brainstem body coordinates: forward, left and counter-clockwise positive', async () => {
  // brainstem_api/README.md coordinates and cms.proto WalkRequest physical units.
  // The SDK learns screen/operator right as +X, which is negative body Y / angular Z.
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'doso-g20@robot'); await f.session.action('enable');
    f.set({ fsmKind: 'standing', transition: 'none' }); await f.session.refresh(); await f.session.acquire();
    for (const [name, drive, turn, expected] of [
      ['forward', { x: 0, y: -1 }, { x: 0, y: 0 }, [.2, 0, 0]],
      ['back', { x: 0, y: 1 }, { x: 0, y: 0 }, [-.2, 0, 0]],
      ['left', { x: -1, y: 0 }, { x: 0, y: 0 }, [0, .2, 0]],
      ['right', { x: 1, y: 0 }, { x: 0, y: 0 }, [0, -.2, 0]],
      ['left turn', { x: 0, y: 0 }, { x: -1, y: 0 }, [0, 0, .3]],
      ['right turn', { x: 0, y: 0 }, { x: 1, y: 0 }, [0, 0, -.3]],
    ]) {
      await f.session.sticks(drive, turn, 900);
      const actual = f.calls.filter(call => call[0] === 'input').at(-1).slice(1);
      assert.deepEqual(actual.map(value => value === 0 ? 0 : value), expected, name);
    }
  } finally { await f.session.disconnect(); }
});

test('right vertical input alone is not marked as active robot motion', async () => {
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'doso-g20@robot'); await f.session.action('enable');
    f.set({ fsmKind: 'standing', transition: 'none' }); await f.session.refresh(); await f.session.acquire();
    await f.session.sticks({ x: 0, y: 0 }, { x: 0, y: 1 }, 900);
    const last = f.calls.filter(call => call[0] === 'input').at(-1);
    assert.ok(last.slice(1).every(value => value === 0));
    f.advance(151); await new Promise(resolve => setTimeout(resolve, 40));
    assert.equal(f.session.state.leaseActive, true, 'unmapped right Y must not start the motion-age watchdog');
  } finally { await f.session.disconnect(); }
});

test('TLS/status opens without claiming authorization, motors or motion authority', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  assert.equal(f.session.state.connected, true);
  assert.equal(f.session.state.principalVerified, false);
  assert.equal(f.session.canAcquire, false);
  assert.equal(f.session.canUseManualControl, false);
  assert.equal(f.session.runtimeState.deviceIdentity, 'unbound');
  assert.equal(f.session.operationReadiness.enableMotor.ready, true);
  await f.session.drive({ x: 0, y: -1 }); assert.equal(f.calls.some(c => c[0] === 'input'), false);
  await f.session.disconnect();
});

test('physical sticks send one coherent drive/turn snapshot and reject non-finite partner', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  await f.session.action('enable');
  f.set({ fsmKind: 'standing', transition: 'none' }); await f.session.refresh(); await f.session.acquire();
  await f.session.sticks({ x: .4, y: -.5 }, { x: -.25, y: .6 });
  const values = f.calls.filter(call => call[0] === 'input');
  assert.equal(values.length, 1);
  assert.deepEqual(values[0], ['input', .1, -.4 * .20, .25 * .30]);
  await f.session.sticks({ x: .4, y: -.5 }, { x: NaN, y: 0 });
  assert.equal(f.session.state.leaseActive, false);
  assert.equal(f.calls.filter(call => call[0] === 'input').length, 1);
  await f.session.disconnect();
});

test('physical sample time survives the session and an invalid timestamp cancels before sending', async () => {
  const f = fixture(); const captured = [];
  f.transport.input = async (...args) => { captured.push(args); return f.reply({ sequence: 2 }); };
  try {
    await f.session.connect(endpoint, 'doso-g20@robot'); await f.session.action('enable');
    f.set({ fsmKind: 'standing', transition: 'none' }); await f.session.refresh(); await f.session.acquire();
    await f.session.sticks({ x: .2, y: -.5 }, { x: .3, y: 0 }, 900);
    assert.equal(captured.length, 1); assert.equal(captured[0][4], 900);
    await f.session.sticks({ x: .2, y: -.5 }, { x: .3, y: 0 }, NaN);
    assert.equal(captured.length, 1); assert.equal(f.session.state.leaseActive, false);
  } finally { await f.session.disconnect(); }
});

test('enable, stand dispatch, observed standing, acquire with zero ACK precede manual input', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  await f.session.acquire(); assert.equal(f.calls.some(c => c[0] === 'acquire'), false);
  await f.session.action('enable'); assert.equal(f.session.operationReadiness.stand.ready, true);
  await f.session.action('stand-up'); assert.equal(f.session.runtimeState.posture, 'unknown');
  assert.equal(f.session.canAcquire, false);
  f.set({ fsmKind: 'standing', transition: 'none' }); await f.session.refresh();
  assert.equal(f.session.canAcquire, true); await f.session.acquire();
  assert.equal(f.session.canUseManualControl, true);
  await f.session.drive({ x: .5, y: -1 });
  assert.deepEqual(f.calls.find(c => c[0] === 'input'), ['input', .2, -.1, 0]);
  assert.equal(f.session.state.sequence, 2);
  assert.equal(f.session.runtimeState.speed.source, 'unknown');
  await f.session.disconnect();
});

test('Yunzhuo, motor fault, transition and stale state block motion and relevant actions', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  f.set({ fsmKind: 'standing', motorOutputEnabled: true, owner: 'yunzhuo' }); await f.session.refresh();
  assert.equal(f.session.canAcquire, false); assert.equal(f.session.operationReadiness.sit.ready, false);
  f.set({ owner: 'none', criticalMotorFault: true }); await f.session.refresh(); assert.equal(f.session.canAcquire, false);
  assert.equal(f.session.operationReadiness.disableMotor.ready, true);
  f.set({ criticalMotorFault: false, fsmKind: 'transitioning' }); await f.session.refresh(); assert.equal(f.session.canAcquire, false);
  f.set({ fsmKind: 'standing' }); await f.session.refresh(); f.advance(1501);
  assert.equal(f.session.canAcquire, false); assert.equal(f.session.runtimeState.motorState, 'unknown');
  await f.session.disconnect();
});

test('unknown profile never dispatches and switch waits for a real catalogue and posture', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  await assert.rejects(f.session.action('switch-profile', 'invented')); assert.equal(f.calls.some(c => c[0] === 'action'), false);
  await f.session.action('switch-profile', 'stairs'); assert.deepEqual(f.calls.find(c => c[0] === 'action'), ['action', 'switch-profile', 'stairs']);
  await f.session.disconnect();
});

test('profile switching allows standing or grounded with either enable state, but rejects walk, lease and faults', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  assert.equal(f.session.operationReadiness.switchPolicy.ready, true);
  for (const patch of [
    { fsmKind: 'walking', motorOutputEnabled: true, grpcLeaseActive: false },
    { fsmKind: 'zero', motorOutputEnabled: false, grpcLeaseActive: false },
    { fsmKind: 'grounded', motorOutputEnabled: false, grpcLeaseActive: true },
  ]) {
    f.set(patch); await f.session.refresh();
    assert.equal(f.session.operationReadiness.switchPolicy.ready, false);
    await assert.rejects(f.session.action('switch-profile', 'stairs'));
  }
  assert.equal(f.calls.some(c => c[0] === 'action'), false);
  for (const fsmKind of ['grounded', 'standing']) for (const motorOutputEnabled of [true, false]) {
    f.set({ fsmKind, motorOutputEnabled, grpcLeaseActive: false }); await f.session.refresh();
    assert.equal(f.session.operationReadiness.switchPolicy.ready, true);
    await f.session.action('switch-profile', 'stairs');
  }
  assert.equal(f.calls.filter(c => c[0] === 'action').length, 4);
  for (const patch of [{ criticalMotorFault: true }, { criticalMotorFault: false, owner: 'yunzhuo' }]) {
    f.set(patch); await f.session.refresh();
    await assert.rejects(f.session.action('switch-profile', 'stairs'));
  }
  await f.session.disconnect();
});

test('out-of-order ACK clears authority and closes without replay', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
  f.transport.input = async () => f.reply({ sequence: 999 });
  await f.session.drive({ x: 0, y: -1 });
  assert.equal(f.session.state.phase, 'error'); assert.equal(f.session.canUseManualControl, false);
  assert.ok(f.calls.some(c => c[0] === 'interrupt')); assert.ok(f.calls.some(c => c[0] === 'close'));
  await f.session.drive({ x: 0, y: -1 });
  assert.equal(f.session.state.phase, 'error'); await f.session.disconnect();
});

test('late Acquire and input ACK cannot resurrect authority after interrupt', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
  let resolveAcquire;
  const acquire = f.transport.acquire;
  f.transport.acquire = async () => { const result = await acquire(); return new Promise(resolve => { resolveAcquire = () => resolve(result); }); };
  const pending = f.session.acquire(); await tick(); await f.session.interrupt(); resolveAcquire(); await pending;
  assert.equal(f.session.state.leaseActive, false); assert.equal(f.session.canUseManualControl, false);
  await f.session.disconnect();
});

test('stale nonzero input interrupts instead of periodically renewing the cached command', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
  await f.session.drive({ x: 0, y: -1 }); f.advance(151);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(f.session.state.leaseActive, false);
  assert.equal(f.calls.filter(c => c[0] === 'input').length, 1);
  assert.ok(f.calls.some(c => c[0] === 'interrupt'));
  await f.session.disconnect();
});

test('ownership retirement closes late connection and prevents reconnect', async () => {
  const f = fixture(); let resolve;
  f.transport.open = () => new Promise(complete => { resolve = complete; });
  const pending = f.session.connect(endpoint, 'doso-g20@robot');
  f.session.dispose(); resolve({ ...f.reply(), sessionId: 'late', transport: 'grpc-mtls', mutualTlsVerified: true }); await pending;
  assert.equal(f.session.state.connected, false); assert.ok(f.calls.some(c => c[0] === 'close'));
  assert.equal(await f.session.connect(endpoint, 'doso-g20@robot'), false);
});

test('explicit prepare waits for first live gesture and never replays the pre-ACK sample', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
  assert.equal(f.session.prepareManualControl(), true);
  assert.equal(f.session.state.manualPrepared, true);
  assert.equal(f.session.canBeginManualControl, true);
  assert.equal(f.session.canUseManualControl, false);
  assert.equal(f.calls.some(c => c[0] === 'acquire'), false);
  await f.session.drive({ x: 0, y: -1 });
  assert.equal(f.calls.some(c => c[0] === 'acquire'), true);
  assert.equal(f.calls.some(c => c[0] === 'input'), false);
  await f.session.drive({ x: .5, y: 0 });
  assert.deepEqual(f.calls.find(c => c[0] === 'input'), ['input', 0, -.1, 0]);
  await f.session.interrupt();
  assert.equal(f.session.state.manualPrepared, false); assert.equal(f.session.canBeginManualControl, false);
  await f.session.disconnect();
});

test('natural lease expiry requires a new explicit prepare, and malformed samples never acquire', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
  f.session.prepareManualControl(); await f.session.drive({ x: NaN, y: -1 });
  assert.equal(f.calls.some(c => c[0] === 'acquire'), false);
  f.session.prepareManualControl(); await f.session.drive({ x: 0, y: -1 });
  await f.transport.interrupt(); await f.session.refresh();
  assert.equal(f.session.state.manualPrepared, false); assert.equal(f.session.canBeginManualControl, false);
  const previous = f.calls.filter(c => c[0] === 'acquire').length;
  await f.session.drive({ x: 0, y: -1 });
  assert.equal(f.calls.filter(c => c[0] === 'acquire').length, previous);
  await f.session.disconnect();
});

test('a pending movement released before its ACK is cancelled and cannot re-arm', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
  let complete;
  f.transport.input = () => new Promise(resolve => { complete = () => resolve(f.reply({ sequence: 2 })); });
  const movement = f.session.drive({ x: 0, y: -1 }); await tick();
  await f.session.drive({ x: 0, y: 0 }); complete(); await movement;
  assert.equal(f.session.state.leaseActive, false); assert.equal(f.session.canUseManualControl, false);
  await f.session.disconnect();
});

test('protected action failures reject UI promises and never complete from an uncertain response', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  f.transport.action = async () => { throw { code: 'unauthorized', message: 'private upstream' }; };
  await assert.rejects(f.session.action('enable'), /未获机器狗授权/);
  assert.equal(f.session.state.phase, 'error'); assert.equal(f.session.state.principalVerified, false);
  assert.ok(!JSON.stringify(f.session.state).includes('private upstream'));
});

test('published final snapshots expose settled readiness without depending on React batching', async () => {
  const f = fixture(); const snapshots = [];
  f.session.subscribe(() => snapshots.push({ phase: f.session.state.phase, canAcquire: f.session.canAcquire,
    stand: f.session.operationReadiness.stand.ready, enable: f.session.operationReadiness.enableMotor.ready }));
  await f.session.connect(endpoint, 'doso-g20@robot');
  assert.equal(snapshots.at(-1).enable, true);
  await f.session.action('enable'); assert.equal(snapshots.at(-1).stand, true);
  f.set({ fsmKind: 'standing' }); await f.session.refresh();
  assert.equal(snapshots.at(-1).canAcquire, true);
  await f.session.disconnect();
});

test('background polling does not disable confirmation and actions wait for the status read', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  let resolveRead;
  f.transport.read = () => new Promise(resolve => { resolveRead = () => resolve(f.reply()); });
  const read = f.session.refresh();
  assert.equal(f.session.operationReadiness.enableMotor.ready, true);
  const enable = f.session.action('enable'); await tick();
  assert.equal(f.calls.some(c => c[0] === 'action'), false);
  resolveRead(); await read; await enable;
  assert.equal(f.session.runtimeState.motorState, 'enabled');
  await f.session.disconnect();
});

test('an action waiting for a status read cannot transfer to a replacement connection', async () => {
  const f = fixture();
  let resolveRead;
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    f.transport.read = () => new Promise(resolve => { resolveRead = () => resolve(f.reply()); });
    const reading = f.session.refresh();
    const action = f.session.action('enable');
    // Observe rejection immediately so a cancelled intent never becomes an unhandled promise.
    const outcome = action.then(() => 'dispatched', () => 'cancelled');
    await f.session.disconnect();
    await f.session.connect({ ...endpoint, host: '192.0.2.2' }, 'doso-g20@other');
    resolveRead(); await reading;
    assert.equal(await outcome, 'cancelled');
    assert.equal(f.calls.filter(call => call[0] === 'action').length, 0, 'old intent must not act on the new robot');
  } finally { await f.session.disconnect(); }
});

test('an acquire waiting for a status read cannot arm a replacement connection', async () => {
  const f = fixture();
  let resolveRead;
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
    f.transport.read = () => new Promise(resolve => { resolveRead = () => resolve(f.reply()); });
    const reading = f.session.refresh();
    const acquiring = f.session.acquire();
    await f.session.disconnect();
    await f.session.connect({ ...endpoint, host: '192.0.2.2' }, 'doso-g20@other');
    resolveRead(); await reading; await acquiring;
    assert.equal(f.calls.filter(call => call[0] === 'acquire').length, 0);
    assert.equal(f.session.state.leaseActive, false);
  } finally { await f.session.disconnect(); }
});

test('backward, invalid and deadline clocks cannot keep stale control state usable', async () => {
  for (const delta of [-1, 1500, NaN, Infinity]) {
    const f = fixture();
    try {
      await f.session.connect(endpoint, 'doso-g20@robot');
      f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
      f.advance(delta);
      assert.equal(f.session.canAcquire, false, `elapsed ${delta}`);
      assert.equal(f.session.runtimeState.motorState, 'unknown', `elapsed ${delta}`);
    } finally { await f.session.disconnect(); }
  }
});

test('an unconfirmed native stop rejects the explicit action and retires local authority', async () => {
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    f.transport.interrupt = async () => { throw { code: 'stop_unconfirmed', message: 'private native detail' }; };
    await assert.rejects(f.session.interrupt(), /停止请求未确认/);
    assert.equal(f.session.state.phase, 'error');
    assert.equal(f.session.state.leaseActive, false);
    assert.equal(f.session.canUseManualControl, false);
    assert.ok(f.calls.some(call => call[0] === 'close'));
    assert.doesNotMatch(JSON.stringify(f.session.state), /private native detail/);
  } finally { await f.session.disconnect(); }
});
