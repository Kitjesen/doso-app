import assert from 'node:assert/strict';
import test from 'node:test';
import { BrainstemControlSession } from '../src/features/control/brainstemControlSession.ts';

const endpoint = { host: '192.0.2.1', port: 13145, clientIdentityAlias: 'fixture' };

function fixture(t, clock) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'performance');
  const setClock = value => Object.defineProperty(globalThis, 'performance', { configurable: true, value });
  setClock(clock);
  t.after(() => Object.defineProperty(globalThis, 'performance', original));
  let lease = false;
  let sequence = 0;
  const calls = [];
  const reply = () => ({
    status: { fsmKind: 'standing', transition: 'none', motorOutputEnabled: true,
      owner: lease ? 'grpc' : 'none', criticalMotorFault: false,
      grpcLeaseActive: lease, readyForWalk: lease },
    leaseActive: lease, principalVerified: lease, ...(sequence ? { sequence } : {}),
  });
  const transport = {
    async open() { return { ...reply(), sessionId: 'clock', transport: 'grpc-mtls', mutualTlsVerified: true }; },
    async read() { return reply(); },
    async action() { calls.push('action'); return reply(); },
    async acquire() { calls.push('acquire'); lease = true; sequence = 1; return reply(); },
    async input() { calls.push('input'); sequence++; return reply(); },
    async interrupt() { calls.push('interrupt'); lease = false; return reply(); },
    async close() { calls.push('close'); },
  };
  // Exercise the production default clock, rather than the injected test clock.
  const session = new BrainstemControlSession(transport);
  t.after(() => session.disconnect());
  return { session, calls, setClock };
}

test('missing monotonic clock never falls back to a wall clock for control authority', async t => {
  const wall = t.mock.method(Date, 'now', () => 1000);
  const f = fixture(t, undefined);
  for (const clock of [undefined, {}]) {
    f.setClock(clock);
    await f.session.connect(endpoint, 'doso-g20@robot');
    assert.equal(f.session.canAcquire, false);
    assert.equal(f.session.prepareManualControl(), false);
    assert.equal(f.session.operationReadiness.sit.ready, false);
    assert.equal(f.session.runtimeState.motorState, 'unknown');
    await f.session.acquire();
    await f.session.drive({ x: 0, y: -1 });
    assert.equal(f.calls.some(call => ['action', 'acquire', 'input'].includes(call)), false);
    await f.session.disconnect();
  }
  assert.equal(wall.mock.callCount(), 0);
});

test('invalid or failing default monotonic readings cannot grant control', async t => {
  const f = fixture(t, undefined);
  for (const value of [-1, NaN, Infinity]) {
    f.setClock({ now: () => value });
    await f.session.connect(endpoint, 'doso-g20@robot');
    assert.equal(f.session.canAcquire, false, `reading ${value}`);
    await f.session.disconnect();
  }
  f.setClock({ now() { throw new Error('clock unavailable'); } });
  await f.session.connect(endpoint, 'doso-g20@robot');
  assert.equal(f.session.canAcquire, false);
  assert.equal(f.calls.includes('acquire'), false);
});

test('wall-clock jumps do not change the 1500ms observed-state deadline', async t => {
  let at = 1000;
  let wallAt = 1_800_000_000_000;
  const wall = t.mock.method(Date, 'now', () => wallAt);
  const f = fixture(t, { now: () => at });
  await f.session.connect(endpoint, 'doso-g20@robot');
  assert.equal(f.session.canAcquire, true);
  wallAt -= 86_400_000; at += 1499;
  assert.equal(f.session.canAcquire, true);
  wallAt += 172_800_000; at += 1;
  assert.equal(f.session.canAcquire, false);
  assert.equal(wall.mock.callCount(), 0);
});

test('losing the monotonic clock during motion blocks the next sample and revokes the lease', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  t.mock.method(Date, 'now', () => 1000);
  const f = fixture(t, { now: () => 1000 });
  await f.session.connect(endpoint, 'doso-g20@robot');
  await f.session.acquire();
  await f.session.drive({ x: 0, y: -1 });
  assert.equal(f.calls.filter(call => call === 'input').length, 1);
  f.setClock(undefined);
  await f.session.drive({ x: .5, y: -1 });
  t.mock.timers.tick(25);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(f.calls.filter(call => call === 'input').length, 1);
  assert.equal(f.calls.filter(call => call === 'interrupt').length, 1);
  assert.equal(f.session.state.leaseActive, false);
  assert.equal(f.session.canUseManualControl, false);
});
