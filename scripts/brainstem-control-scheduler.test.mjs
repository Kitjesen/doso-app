import assert from 'node:assert/strict';
import test from 'node:test';
import { BrainstemControlSession } from '../src/features/control/brainstemControlSession.ts';

const endpoint = { host: '192.0.2.1', port: 13145, clientIdentityAlias: 'fixture' };
const settle = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t, ackMs = 0) {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let at = 1000, lease = false, sequence = 0, allowed = true;
  let pendingAck, busyRemaining = 0, acquisitions = 0;
  let statusPatch = {};
  const sent = [], stops = [], attempts = [];
  let inFlight = 0, maxInFlight = 0;
  const reply = () => ({ leaseActive: lease, principalVerified: lease, sequence,
    status: { fsmKind: 'standing', transition: 'none', motorOutputEnabled: true,
      owner: lease ? 'grpc' : 'none', criticalMotorFault: false, grpcLeaseActive: lease, readyForWalk: lease, ...statusPatch } });
  const session = new BrainstemControlSession({
    async open() { return { ...reply(), sessionId: 'scheduler', transport: 'grpc-mtls', mutualTlsVerified: true,
      profile: { current: 'flat', available: ['flat'], descriptions: [], currentDescription: '' } }; },
    async acquire() { acquisitions++; lease = true; sequence = 1; return reply(); },
    async read() { return reply(); },
    async input(_id, forward, lateral, yaw, sampledAtMonotonicMs) {
      attempts.push({ at, forward, lateral, yaw, sampledAtMonotonicMs });
      if (busyRemaining > 0) { busyRemaining--; throw { code: 'busy' }; }
      maxInFlight = Math.max(maxInFlight, ++inFlight);
      sent.push({ at, forward, lateral, yaw, sampledAtMonotonicMs });
      sequence++;
      const ack = reply();
      if (ackMs) await new Promise(resolve => { pendingAck = { due: at + ackMs, resolve }; });
      inFlight--; return ack;
    },
    async interrupt() { stops.push(at); lease = false; return reply(); },
    async close() {},
  }, () => allowed, () => at);
  t.after(async () => { await session.disconnect(); pendingAck?.resolve(); await settle(); });
  await session.connect(endpoint, 'fixture'); await session.acquire();
  return { session, sent, stops, attempts, get at() { return at; }, get maxInFlight() { return maxInFlight; },
    get acquisitions() { return acquisitions; }, setBusy(value) { busyRemaining = value; },
    setAllowed(value) { allowed = value; },
    setStatus(value) { statusPatch = value; },
    async stall(ms) { at += ms; t.mock.timers.tick(ms); await settle(); },
    async step(ms, sample) {
      for (let elapsed = 1; elapsed <= ms; elapsed++) {
        at++;
        if (pendingAck && pendingAck.due <= at) {
          const ack = pendingAck; pendingAck = undefined; ack.resolve(); await settle();
        }
        sample?.(at);
        t.mock.timers.tick(1); await settle();
      }
    },
  };
}

test('bounded live samples target 50Hz independently of input events and renders', async t => {
  const f = await fixture(t);
  await f.session.sticks({ x: 0, y: -.2 }, { x: .1, y: 0 }, 0);
  await f.step(999, at => {
    if (at % 5 === 0) void f.session.sticks({ x: 0, y: -.8 }, { x: -.5, y: 0 }, at - 1000);
  });
  assert.equal(f.sent.length, 50);
  assert.deepEqual(f.sent.map(command => command.at), Array.from({ length: 50 }, (_, index) => 1000 + index * 20));
  assert.equal(f.maxInFlight, 1);
  assert.ok(f.sent.slice(1).every(command => command.sampledAtMonotonicMs === command.at - 1000
    && command.forward === .8 && command.yaw === .5));
  t.diagnostic('1000ms window: 50 dispatches, target 50Hz, max 1 RPC in flight; 5ms source updates coalesced.');
});

test('zero input rejected as pre-dispatch busy waits for the next tick without a new pointer sample', async t => {
  const f = await fixture(t); f.setBusy(1);
  await f.session.drive({ x: 0, y: 0 });
  assert.equal(f.session.state.leaseActive, true); assert.equal(f.sent.length, 0);
  await f.step(19); assert.equal(f.attempts.length, 1);
  await f.step(1);
  assert.deepEqual(f.attempts.map(input => input.at), [1000, 1020]);
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].forward, 0);
  assert.equal(f.session.state.sequence, 2, 'busy cannot consume a wire sequence');
  await f.step(200);
  assert.equal(f.sent.length, 1, 'the accepted zero is cleared instead of replayed');
  assert.equal(f.acquisitions, 1);
});

test('nonzero pre-dispatch busy retains only the latest complete target and its original physical time', async t => {
  const f = await fixture(t); f.setBusy(1);
  await f.session.sticks({ x: 0, y: -.4 }, { x: 0, y: 0 }, 700);
  await f.step(10);
  await f.session.sticks({ x: .2, y: -.8 }, { x: -.5, y: 0 }, 710);
  assert.equal(f.attempts.length, 1);
  await f.step(10);
  assert.deepEqual(f.sent, [{ at: 1020, forward: .8, lateral: -.2, yaw: .5, sampledAtMonotonicMs: 710 }]);
  assert.equal(f.session.state.sequence, 2); assert.equal(f.acquisitions, 1);
});

test('repeated neutral events cannot spin on pre-dispatch busy between 20ms ticks', async t => {
  const f = await fixture(t); f.setBusy(3);
  await f.session.drive({ x: 0, y: 0 });
  await f.step(60, at => { if (at % 5 === 0) void f.session.drive({ x: 0, y: 0 }); });
  assert.deepEqual(f.attempts.map(input => input.at), [1000, 1020, 1040, 1060]);
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].forward, 0);
  assert.equal(f.session.state.sequence, 2); assert.equal(f.session.state.leaseActive, true);
});

for (const [name, vector] of [['zero', { x: 0, y: 0 }], ['nonzero', { x: 0, y: -.4 }]]) {
  test(`repeated pre-dispatch busy cannot renew the original ${name} target past 150ms`, async t => {
    const f = await fixture(t); f.setBusy(Infinity);
    await f.session.drive(vector);
    await f.step(150); assert.equal(f.session.state.leaseActive, true);
    await f.step(10);
    assert.equal(f.session.state.leaseActive, false);
    assert.deepEqual(f.attempts.map(input => input.at), [1000, 1020, 1040, 1060, 1080, 1100, 1120, 1140]);
    assert.deepEqual(f.stops, [1160]); assert.equal(f.sent.length, 0); assert.equal(f.acquisitions, 1);
  });
}

test('revocation drops the pre-dispatch busy target without later sends or automatic Acquire', async t => {
  const f = await fixture(t); f.setBusy(1);
  await f.session.drive({ x: 0, y: -.4 }); f.setAllowed(false);
  await f.step(20); assert.equal(f.session.state.leaseActive, false);
  f.setAllowed(true); await f.step(40); await f.session.drive({ x: 0, y: -.8 });
  assert.equal(f.attempts.length, 1); assert.equal(f.sent.length, 0); assert.equal(f.acquisitions, 1);
});

test('80ms ACK lowers measured rate without backlog, concurrent RPCs or ACK-triggered sends', async t => {
  const f = await fixture(t, 80);
  const first = f.session.sticks({ x: 0, y: -.2 }, { x: 0, y: 0 }, 0);
  await f.step(999, at => {
    if (at % 5 === 0) void f.session.sticks({ x: 0, y: -.8 }, { x: -.5, y: 0 }, at - 1000);
  });
  await first;
  assert.equal(f.sent.length, 13);
  assert.deepEqual(f.sent.map(command => command.at), Array.from({ length: 13 }, (_, index) => 1000 + index * 80));
  assert.equal(f.maxInFlight, 1);
  assert.ok(f.sent.every(command => command.sampledAtMonotonicMs === command.at - 1000));
  t.diagnostic('1000ms window: 13 dispatches, steady spacing 80ms / 12.5Hz; max 1 RPC in flight, no catch-up sends.');
});

test('20ms neutral after a nonzero in-flight target still interrupts before its delayed ACK', async t => {
  const f = await fixture(t, 80);
  const first = f.session.drive({ x: 0, y: -.8 });
  await f.step(20, at => { if (at % 20 === 0) void f.session.drive({ x: 0, y: 0 }); });
  assert.deepEqual(f.stops, [1020]);
  assert.equal(f.session.state.leaseActive, false);
  assert.equal(f.sent.length, 1);
  await f.step(80); await first;
  assert.equal(f.session.state.leaseActive, false, 'the old motion ACK cannot re-arm after the neutral stop');
  assert.equal(f.sent.length, 1);
  assert.equal(f.maxInFlight, 1);
});

test('scheduler preserves repeated SDK sample time and stops when its 150ms age expires', async t => {
  const f = await fixture(t);
  await f.session.sticks({ x: 0, y: -.8 }, { x: .5, y: 0 }, 700);
  await f.step(150);
  assert.deepEqual(f.sent.map(command => command.sampledAtMonotonicMs), Array(8).fill(700));
  assert.equal(f.session.state.leaseActive, true, 'the existing 150ms boundary is inclusive');
  await f.step(10);
  assert.equal(f.session.state.leaseActive, false);
  assert.deepEqual(f.stops, [1160]);
  assert.equal(f.sent.length, 8);
  await f.step(200);
  assert.equal(f.sent.length, 8, 'no input replay after the stale-source stop');
  t.diagnostic('Frozen SDK source: original sample timestamp 700 retained; last send at age 140ms, stop at first 20ms tick after 150ms (160ms).');
});

test('an ACK between deadlines waits for the next tick instead of chasing missed sends', async t => {
  const f = await fixture(t, 81);
  const first = f.session.drive({ x: 0, y: -.8 });
  await f.step(80);
  await f.session.drive({ x: 0, y: -.5 });
  await f.step(1); await first;
  assert.equal(f.sent.length, 1, 'the ACK at 81ms cannot dispatch the waiting target');
  await f.step(18);
  assert.equal(f.sent.length, 1);
  await f.step(1);
  assert.deepEqual(f.sent.map(command => command.at), [1000, 1100]);
  assert.equal(f.sent[1].forward, .5);
});

test('turn updates cannot renew an expired drive axis while the clock repeats complete targets', async t => {
  const f = await fixture(t, 80);
  const first = f.session.drive({ x: 0, y: -.8 });
  await f.step(100); await first;
  await f.session.turn({ x: .5, y: 0 });
  await f.step(60, at => {
    if (at % 20 === 0) void f.session.turn({ x: .5, y: 0 });
  });
  assert.equal(f.session.state.leaseActive, false);
  assert.deepEqual(f.stops, [1160]);
  assert.ok(f.sent.every(command => command.at < 1160));
});

test('a blocked event loop drops missed deadlines instead of catching up', async t => {
  const f = await fixture(t);
  await f.session.drive({ x: 0, y: -.8 });
  await f.stall(100);
  assert.deepEqual(f.sent.map(command => command.at), [1000, 1100], 'missed callbacks produce only one latest target');
  await f.step(20);
  assert.deepEqual(f.sent.map(command => command.at), [1000, 1100, 1120]);
});

test('neutral and background revoke cached motion before any further clocked send', async t => {
  const f = await fixture(t);
  await f.session.drive({ x: 0, y: -.8 });
  await f.session.drive({ x: 0, y: 0 });
  assert.equal(f.sent.at(-1).forward, 0, 'neutral bypasses the movement cadence');
  await f.step(40);
  assert.equal(f.sent.length, 2, 'neutral clears the cached target');
  await f.session.drive({ x: 0, y: -.8 });
  assert.equal(f.sent.length, 3, 'a new touch after neutral retains its immediate first frame');
  f.setAllowed(false);
  await f.step(20);
  assert.equal(f.sent.length, 3);
  assert.equal(f.session.state.leaseActive, false);
});

test('unsafe status drops cached targets and recovery needs a new live gesture', async t => {
  const f = await fixture(t);
  await f.session.drive({ x: 0, y: -.8 });
  f.setStatus({ criticalMotorFault: true });
  // Live motion receives state through its next ACK, not a competing status RPC.
  await f.step(40);
  assert.equal(f.sent.length, 2);
  f.setStatus({}); await f.session.refresh();
  await f.step(40);
  assert.equal(f.sent.length, 2, 'status recovery cannot replay the previous intent');
  await f.session.turn({ x: .5, y: 0 });
  assert.equal(f.sent.at(-1).forward, 0, 'a new turn cannot revive the previous drive axis');
  await f.step(20);
  assert.equal(f.sent.length, 4, 'the live lease clock still schedules fresh intent after recovery');
});
