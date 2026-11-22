import assert from 'node:assert/strict';
import test from 'node:test';
import { BrainstemControlSession } from '../src/features/control/brainstemControlSession.ts';
import { BrainstemConnectionRecovery } from '../src/features/control/brainstemConnectionRecovery.ts';

const endpoint = { host: '192.0.2.1', port: 13145, transport: 'lan-dev' };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function dispatchOnce(f) {
  const action = f.transport.action;
  f.transport.action = async () => f.reply();
  await f.session.action('enable');
  f.transport.action = action;
}
function fixture(onConnected) {
  let at = 0, foreground = true, sequence = 0;
  const calls = [], connected = [];
  const reply = () => ({ transport: 'grpc-lan', principalVerified: false, leaseActive: false, leaseOwnerMatched: false,
    status: { fsmKind: 'grounded', transition: 'none', motorOutputEnabled: false,
      owner: 'none', criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: false } });
  const transport = {
    async open(target, principal) { calls.push(['open', target.host, principal]); return { ...reply(), sessionId: `s${++sequence}`,
      mutualTlsVerified: false, clientIdentitySelected: false,
      profile: { current: 'flat', available: ['flat'], descriptions: [], currentDescription: '' } }; },
    async read(id) { calls.push(['read', id]); return reply(); },
    async interrupt(id) { calls.push(['interrupt', id]); return reply(); },
    async close(id) { calls.push(['close', id]); },
    async action() { throw Error('recovery must not dispatch actions'); },
    async acquire() { throw Error('recovery must not acquire'); },
    async input() { throw Error('recovery must not replay input'); },
  };
  const session = new BrainstemControlSession(transport, () => foreground, () => at);
  const recovery = new BrainstemConnectionRecovery(session, () => at, (target, principal) => {
    connected.push([target, principal]); onConnected?.(target, principal);
  });
  return { session, recovery, transport, calls, connected, reply,
    async advance(ms) { at += ms; await recovery.tick(); },
    active(value) { foreground = value; recovery.setActive(value); },
  };
}

test('saved target opens a status channel with no enable, lease or old input', async () => {
  const f = fixture(); f.recovery.restore(endpoint, ''); await f.advance(0);
  assert.equal(f.session.state.connected, true);
  assert.equal(f.session.state.leaseActive, false); assert.equal(f.session.state.manualPrepared, false);
  assert.equal(f.session.state.sequence, 0);
  assert.deepEqual(f.calls.map(call => call[0]), ['open']);
  assert.deepEqual(f.connected, [[endpoint, '']]); await f.recovery.disconnect();
});

test('a status transport failure reconnects after backoff to the same endpoint only', async t => {
  t.mock.method(console, 'info', () => {});
  const f = fixture(); await f.recovery.connect(endpoint, '');
  f.transport.read = async () => { throw { code: 'unavailable' }; };
  await f.session.refresh(); assert.equal(f.session.state.failureCode, 'unavailable');
  await f.advance(0); await f.advance(999);
  assert.equal(f.calls.filter(call => call[0] === 'open').length, 1);
  await f.advance(1);
  assert.equal(f.session.state.connected, true);
  assert.deepEqual(f.calls.filter(call => call[0] === 'open'), [['open', endpoint.host, ''], ['open', endpoint.host, '']]);
  assert.equal(f.session.state.manualPrepared, false); await f.recovery.disconnect();
});

test('retries are bounded and cannot overlap a pending open', async t => {
  t.mock.method(console, 'info', () => {});
  const f = fixture(); let finish;
  f.transport.open = async () => { f.calls.push(['open']); await new Promise(resolve => { finish = resolve; }); throw { code: 'timeout' }; };
  f.recovery.restore(endpoint, ''); const first = f.advance(0); await tick();
  for (let i = 0; i < 10; i++) await f.advance(10000);
  assert.equal(f.calls.length, 1); finish(); await first;
  f.transport.open = async () => { f.calls.push(['open']); throw { code: 'timeout' }; };
  for (let i = 0; i < 20; i++) await f.advance(20000);
  assert.equal(f.calls.length, 5); assert.equal(f.recovery.reconnecting, false); await f.recovery.disconnect();
});

test('authorization, identity and protocol failures never enter automatic retry', async t => {
  t.mock.method(console, 'info', () => {});
  for (const code of ['unauthorized', 'invalid_response', 'config', 'precondition', 'unimplemented', 'ack_mismatch']) {
    const f = fixture(); f.transport.open = async () => { f.calls.push(['open']); throw { code }; };
    f.recovery.restore(endpoint, ''); await f.advance(0);
    for (let i = 0; i < 5; i++) await f.advance(20000);
    f.active(false); await tick(); f.active(true); await f.advance(20000);
    assert.equal(f.calls.length, 1, code); await f.recovery.disconnect();
  }
});

test('unconfirmed stop is retained and blocks automatic reopen including foreground return', async t => {
  t.mock.method(console, 'info', () => {});
  const f = fixture(); await f.recovery.connect(endpoint, '');
  await dispatchOnce(f);
  f.transport.read = async () => { throw { code: 'unavailable' }; };
  f.transport.interrupt = async () => { throw { code: 'stop_unconfirmed' }; };
  await f.session.refresh(); assert.match(f.session.state.error, /停止请求未确认/);
  for (let i = 0; i < 5; i++) await f.advance(20000);
  f.active(false); await tick(); f.active(true); await f.advance(20000);
  assert.equal(f.calls.filter(call => call[0] === 'open').length, 1);
  assert.equal(f.session.state.failureCode, 'stop_unconfirmed'); await f.recovery.disconnect();
});

test('foreground return reopens status without restoring control', async () => {
  const f = fixture(); await f.recovery.connect(endpoint, '');
  f.active(false); await tick(); await f.advance(100000);
  assert.equal(f.calls.filter(call => call[0] === 'open').length, 1);
  f.active(true); await f.advance(0);
  assert.equal(f.calls.filter(call => call[0] === 'open').length, 2);
  assert.equal(f.session.state.connected, true); assert.equal(f.session.state.leaseActive, false);
  assert.equal(f.session.state.manualPrepared, false); await f.recovery.disconnect();
});

test('explicit disconnect suppresses same saved target until a new manual selection', async () => {
  const f = fixture(); await f.recovery.connect(endpoint, ''); await f.recovery.disconnect();
  f.recovery.restore({ ...endpoint }, ''); f.active(false); await tick(); f.active(true); await f.advance(100000);
  assert.equal(f.calls.filter(call => call[0] === 'open').length, 1);
  assert.equal(await f.recovery.connect(endpoint, ''), true);
  assert.equal(f.calls.filter(call => call[0] === 'open').length, 2); await f.recovery.disconnect();
});

test('target replacement waits for old open and closes its late result', async () => {
  const f = fixture(); let finish;
  const original = f.transport.open;
  f.transport.open = async (...args) => { const value = await original(...args); await new Promise(resolve => { finish = () => resolve(); }); return value; };
  f.recovery.restore(endpoint, ''); const old = f.advance(0); await tick();
  const replacement = { ...endpoint, host: '192.0.2.2' }; f.recovery.restore(replacement, ''); await f.advance(10000);
  assert.equal(f.calls.filter(call => call[0] === 'open').length, 1);
  f.transport.open = original; finish(); await old;
  assert.equal(f.connected.length, 0); assert.ok(f.calls.some(call => call[0] === 'close' && call[1] === 's1'));
  await f.advance(0); assert.equal(f.session.state.connected, true);
  assert.equal(f.connected[0][0].host, replacement.host); await f.recovery.disconnect();
});

test('background or intentional disconnect prevents late opens from persisting or publishing', async () => {
  for (const stop of ['background', 'disconnect']) {
    const f = fixture(); let finish;
    const original = f.transport.open;
    f.transport.open = async (...args) => { const reply = await original(...args); await new Promise(resolve => { finish = resolve; }); return reply; };
    const opening = f.recovery.connect(endpoint, ''); await tick();
    if (stop === 'background') f.active(false); else await f.recovery.disconnect();
    finish(); assert.equal(await opening, false);
    assert.equal(f.connected.length, 0); assert.equal(f.session.state.connected, false);
    assert.ok(f.calls.some(call => call[0] === 'close')); await f.recovery.disconnect();
  }
});

test('recovery waits for stop cleanup and does not hide a late unconfirmed stop', async t => {
  t.mock.method(console, 'info', () => {});
  const f = fixture(); await f.recovery.connect(endpoint, ''); let rejectStop;
  await dispatchOnce(f);
  f.transport.read = async () => { throw { code: 'timeout' }; };
  f.transport.interrupt = () => new Promise((_resolve, reject) => { rejectStop = reject; });
  const failed = f.session.refresh(); await tick(); await f.advance(20000);
  assert.equal(f.calls.filter(call => call[0] === 'open').length, 1);
  rejectStop({ code: 'stop_unconfirmed' }); await failed; await f.advance(20000);
  assert.equal(f.session.state.failureCode, 'stop_unconfirmed');
  assert.equal(f.calls.filter(call => call[0] === 'open').length, 1); await f.recovery.disconnect();
});

test('persistence callback errors cannot close a verified status channel', async () => {
  const f = fixture(() => { throw Error('storage unavailable'); });
  assert.equal(await f.recovery.connect(endpoint, ''), true);
  assert.equal(f.session.state.connected, true); await f.recovery.disconnect();
});

test('automatic open retries bounded native telemetry admission busy then succeeds', async t => {
  t.mock.method(console, 'info', () => {});
  const f = fixture(), original = f.transport.open;
  let attempts = 0;
  f.transport.open = async (...args) => {
    if (++attempts === 1) { f.calls.push(['open-busy']); throw { code: 'busy' }; }
    return original(...args);
  };
  f.recovery.restore(endpoint, ''); await f.advance(0);
  assert.equal(f.session.state.failureCode, 'busy'); assert.equal(f.recovery.reconnecting, true);
  await f.advance(1999); assert.equal(attempts, 1);
  await f.advance(1); assert.equal(attempts, 2); assert.equal(f.session.state.connected, true);
  assert.equal(f.session.state.leaseActive, false); assert.equal(f.session.state.manualPrepared, false);
  await f.recovery.disconnect();
});

test('busy from an existing status read or action cannot start automatic reconnect', async t => {
  t.mock.method(console, 'info', () => {});
  for (const operation of ['read', 'action']) {
    const f = fixture(); await f.recovery.connect(endpoint, '');
    f.transport[operation] = async () => { throw { code: 'busy' }; };
    if (operation === 'read') await f.session.refresh();
    else await assert.rejects(f.session.action('enable'), error => error.code === 'busy');
    assert.equal(f.session.state.failureCode, 'busy');
    for (let i = 0; i < 10; i++) await f.advance(20000);
    assert.equal(f.calls.filter(call => call[0] === 'open').length, 1);
    assert.equal(f.recovery.reconnecting, false); await f.recovery.disconnect();
  }
});

test('permanent automatic-open busy remains bounded without spinning', async t => {
  t.mock.method(console, 'info', () => {});
  const f = fixture(); let attempts = 0;
  f.transport.open = async () => { attempts++; throw { code: 'busy' }; };
  f.recovery.restore(endpoint, ''); await f.advance(0);
  for (let i = 0; i < 20; i++) await f.advance(20000);
  assert.equal(attempts, 5); assert.equal(f.recovery.reconnecting, false); await f.recovery.disconnect();
});

test('retryNow reopens after bounded retry exhaustion on Wi-Fi return without overriding auth or unconfirmed-stop blocks', async t => {
  t.mock.method(console, 'info', () => {});
  const f = fixture();
  const originalOpen = f.transport.open;
  f.transport.open = async () => { f.calls.push(['open-fail']); throw { code: 'timeout' }; };
  f.recovery.restore(endpoint, '');
  await f.advance(0);
  for (let i = 0; i < 10; i++) await f.advance(20000);
  assert.equal(f.recovery.reconnecting, false);
  assert.equal(f.session.state.connected, false);

  f.transport.open = originalOpen;
  f.recovery.retryNow();
  await tick();
  assert.equal(f.session.state.connected, true);

  // Blocked authorization failure must never be cleared by retryNow
  const auth = fixture();
  auth.transport.open = async () => { auth.calls.push(['open-auth']); throw { code: 'unauthorized' }; };
  auth.recovery.restore(endpoint, '');
  await auth.advance(0);
  auth.transport.open = originalOpen;
  auth.recovery.retryNow();
  await tick();
  assert.equal(auth.session.state.connected, false);
  assert.equal(auth.calls.length, 1);

  await f.recovery.disconnect();
  await auth.recovery.disconnect();
});
