import assert from 'node:assert/strict';
import test from 'node:test';
import { BrainstemControlSession } from '../src/features/control/brainstemControlSession.ts';
import { beginRobotRecovery } from '../src/features/control/robotRecovery.ts';
import { getControlTerrainPolicies, getControlTerrainModeOptions } from '../src/features/control/controlOperations.ts';

const status = (patch = {}) => ({ fsmKind: 'grounded', transition: 'none', motorOutputEnabled: false,
  owner: 'none', criticalMotorFault: false, grpcLeaseActive: false, readyForWalk: false, ...patch });
function fixture(profile = { current: 'flat', available: ['flat', 'stairs'], descriptions: [], currentDescription: '' }) {
  let at = 1000;
  let current = status();
  let lease = false;
  let verified = false;
  let sequence = 0;
  const calls = [];
  const reply = extra => ({ status: { ...current }, leaseActive: lease, principalVerified: verified, ...extra });
  const transport = {
    async open(endpoint, principal) { calls.push(['open', endpoint.host, principal]); return { ...reply(), leaseActive: false, principalVerified: false,
      sessionId: 's1', transport: 'grpc-mtls', mutualTlsVerified: true, profile }; },
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

test('control owner follows fresh device state and matched lease', async () => {
  const f = fixture();
  try {
    assert.equal(f.session.runtimeState.controlOwner, 'unknown');
    await f.session.connect(endpoint, 'fixture');
    assert.equal(f.session.runtimeState.controlOwner, 'none');
    f.set({ owner: 'yunzhuo' }); await f.session.refresh();
    assert.equal(f.session.runtimeState.controlOwner, 'robot-remote');
    f.set({ owner: 'grpc', grpcLeaseActive: true }); await f.session.refresh();
    assert.equal(f.session.runtimeState.controlOwner, 'remote');
    f.set({ owner: 'grpc', grpcLeaseActive: false }); await f.session.refresh();
    assert.equal(f.session.runtimeState.controlOwner, 'unknown');
    f.set({ owner: 'none', grpcLeaseActive: true }); await f.session.refresh();
    assert.equal(f.session.runtimeState.controlOwner, 'unknown');
    f.set({ owner: 'none', grpcLeaseActive: false, fsmKind: 'standing', motorOutputEnabled: true });
    await f.session.refresh(); await f.session.acquire();
    assert.equal(f.session.runtimeState.controlOwner, 'this-device');
    f.advance(1501);
    assert.equal(f.session.runtimeState.controlOwner, 'unknown');
  } finally { await f.session.disconnect(); }
});

test('conflicting lease and owner observations remain unknown', async () => {
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ owner: 'yunzhuo', grpcLeaseActive: true });
    await f.session.refresh();
    assert.equal(f.session.runtimeState.controlOwner, 'unknown');
    f.set({ owner: 'none', grpcLeaseActive: false });
    f.transport.read = async () => f.reply({ leaseActive: true, principalVerified: true, leaseOwnerMatched: true });
    await f.session.refresh();
    assert.equal(f.session.runtimeState.controlOwner, 'unknown');
    f.set({ owner: 'grpc', grpcLeaseActive: true });
    f.transport.read = async () => f.reply({ leaseActive: true, principalVerified: true, leaseOwnerMatched: false });
    await f.session.refresh();
    assert.equal(f.session.runtimeState.controlOwner, 'unknown');
  } finally { await f.session.disconnect(); }
});

test('status polling cannot renew old profile freshness and fresh profile replaces its gates', async () => {
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    const first = f.session.state.profileObservedAt;
    for (let i = 0; i < 40; i++) { f.advance(500); await f.session.refresh(); }
    assert.equal(f.session.state.connected, true);
    assert.equal(f.session.state.profile, null);
    assert.equal(f.session.operationReadiness.switchPolicy.ready, false);
    assert.equal(f.session.runtimeState.policyCatalogStatus, 'unknown');
    assert.equal(f.session.operationReadiness.enableMotor.ready, false, 'unknown mode cannot authorize normal mode actions');
    const profile = { current: 'stairs', available: ['flat', 'stairs'], descriptions: [], currentDescription: 'stairs' };
    f.transport.read = async () => ({ ...f.reply(), profile });
    await f.session.refresh();
    assert.equal(f.session.state.profile.current, 'stairs');
    assert.ok(f.session.state.profileObservedAt > first);
    assert.equal(f.session.operationReadiness.switchPolicy.ready, true);
    f.transport.read = async () => ({ ...f.reply(), profileUnavailable: true });
    await f.session.refresh();
    assert.equal(f.session.state.profile, null);
    assert.equal(f.session.operationReadiness.switchPolicy.ready, false);
  } finally { await f.session.disconnect(); }
});

test('selected recovery blocks normal enable, locomotion and policy actions but keeps disable', async () => {
  const f = fixture({ current: 'flat', available: ['flat'], descriptions: [], currentDescription: '', activeModeId: 'recovery' });
  try {
    await f.session.connect(endpoint, 'fixture');
    assert.equal(f.session.operationReadiness.enableMotor.ready, false);
    assert.equal(f.session.operationReadiness.switchPolicy.ready, false);
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
    assert.equal(f.session.canAcquire, false);
    assert.equal(f.session.operationReadiness.disableMotor.ready, true);
    assert.equal(f.session.runtimeState.recoveryMode.selected, true);
  } finally { await f.session.disconnect(); }
});

test('recovery capability cannot be dispatched as a normal profile switch', async () => {
  const f = fixture({ current: 'flat-id', available: ['flat-id', 'recovery-id'],
    descriptions: ['flat: W5', 'recovery: 自起'], currentDescription: 'flat: W5' });
  try {
    await f.session.connect(endpoint, 'fixture');
    await assert.rejects(f.session.action('switch-profile', 'recovery-id'), /策略已不可用/);
    assert.equal(f.calls.some(call => call[0] === 'action'), false);
  } finally { await f.session.disconnect(); }
});

test('explicit action rejections retire intent and retain a freshly verified channel', async t => {
  t.mock.method(console, 'info', () => {});
  for (const [code, message] of [['unimplemented', /未开放此操作/], ['precondition', /状态不允许/]]) {
    const f = fixture();
    try {
      await f.session.connect(endpoint, 'fixture');
      f.transport.action = async () => { throw { code, message: 'private details' }; };
      await assert.rejects(f.session.action('enable'), error => {
        assert.equal(error.code, code); assert.match(error.message, message);
        assert.doesNotMatch(error.message, /private details/); return true;
      });
      assert.match(f.session.state.error, message);
      assert.doesNotMatch(f.session.state.error, /private|断开|中断/);
      assert.equal(f.session.state.connected, true);
      assert.equal(f.session.state.phase, 'ready');
      assert.equal(f.session.state.leaseActive, false);
      assert.equal(f.session.state.manualPrepared, false);
      assert.equal(f.calls.filter(call => call[0] === 'interrupt').length, 1);
      assert.equal(f.calls.filter(call => call[0] === 'read').length, 1);
      assert.equal(f.calls.some(call => call[0] === 'close'), false);
    } finally { await f.session.disconnect(); }
  }
});

test('action timeout still closes an uncertain transport without retrying the action', async t => {
  t.mock.method(console, 'info', () => {});
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    let attempts = 0;
    f.transport.action = async () => { attempts++; throw { code: 'timeout' }; };
    await assert.rejects(f.session.action('enable'), /请求超时/);
    assert.equal(attempts, 1);
    assert.equal(f.session.state.connected, false);
    assert.equal(f.calls.filter(call => call[0] === 'close').length, 1);
  } finally { await f.session.disconnect(); }
});

test('rejected action cannot revive an armed movement or its pending target', async () => {
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    await f.session.drive({ x: 0, y: -.8 });
    let attempts = 0;
    f.transport.action = async () => { attempts++; throw { code: 'precondition' }; };
    await assert.rejects(f.session.action('sit-down'), /状态不允许/);
    const count = f.calls.filter(call => call[0] === 'input').length;
    await f.session.drive({ x: 0, y: -.8 }); await f.session.refresh();
    assert.equal(f.session.state.connected, true);
    assert.equal(f.session.state.leaseActive, false);
    assert.equal(f.session.state.manualPrepared, false);
    assert.equal(f.session.canUseManualControl, false);
    assert.equal(f.calls.filter(call => call[0] === 'input').length, count);
    assert.equal(f.calls.filter(call => call[0] === 'acquire').length, 1);
    assert.equal(attempts, 1);
  } finally { await f.session.disconnect(); }
});

test('rejection recovery fails closed on unconfirmed stop, read failure or residual own authority', async t => {
  t.mock.method(console, 'info', () => {});
  for (const scenario of ['stop', 'read', 'lease']) {
    const f = fixture();
    try {
      await f.session.connect(endpoint, 'fixture');
      f.transport.action = async () => { throw { code: 'precondition' }; };
      if (scenario === 'stop') f.transport.interrupt = async () => { throw { code: 'stop_unconfirmed' }; };
      if (scenario === 'read') f.transport.read = async () => { throw { code: 'unavailable' }; };
      if (scenario === 'lease') f.transport.read = async () => f.reply({ leaseActive: true, leaseOwnerMatched: true });
      await assert.rejects(f.session.action('enable'), error => {
        assert.equal(error.code, scenario === 'read' ? 'unavailable' : 'stop_unconfirmed');
        assert.match(error.message, scenario === 'read' ? /控制已断开/ : /停止请求未确认/); return true;
      });
      assert.equal(f.session.state.connected, false, scenario);
      assert.equal(f.session.state.leaseActive, false, scenario);
      assert.equal(f.calls.filter(call => call[0] === 'close').length, 1, scenario);
    } finally { await f.session.disconnect(); }
  }
});

test('action errors expose only whitelisted codes and fixed messages', async t => {
  t.mock.method(console, 'info', () => {});
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.transport.action = async () => { throw { code: 'private\ncode', message: 'private-message' }; };
    await assert.rejects(f.session.action('enable'), error => {
      assert.equal(error.code, 'unknown');
      assert.equal(error.message, '控制已断开，请重新连接'); return true;
    });
  } finally { await f.session.disconnect(); }
});

test('late rejection status cannot publish into a replacement connection', async () => {
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.transport.action = async () => { throw { code: 'precondition' }; };
    let finishRead;
    f.transport.read = () => new Promise(resolve => { finishRead = () => resolve(f.reply({ status: status({ criticalMotorFault: true }) })); });
    const action = f.session.action('enable');
    const rejected = assert.rejects(action, /状态不允许/);
    await tick(); assert.equal(typeof finishRead, 'function');
    await f.session.disconnect();
    await f.session.connect({ ...endpoint, host: '192.0.2.2' }, 'other');
    finishRead(); await rejected;
    assert.equal(f.session.state.connected, true);
    assert.equal(f.session.state.status.criticalMotorFault, false);
    assert.equal(f.session.state.error, null);
  } finally { await f.session.disconnect(); }
});

test('rejected profile switch invalidates unrefreshed policy metadata without reconnecting', async () => {
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.transport.action = async () => { throw { code: 'precondition' }; };
    await assert.rejects(f.session.action('switch-profile', 'stairs'), /状态不允许/);
    assert.equal(f.session.state.connected, true);
    assert.equal(f.session.state.profile, null);
    assert.equal(f.session.operationReadiness.switchPolicy.ready, false);
  } finally { await f.session.disconnect(); }
});

test('a nonbusy input failure logs only one fixed sanitized record and still retires authority', async t => {
  const lines = []; t.mock.method(console, 'info', text => lines.push(text));
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    f.transport.input = async () => { throw { code: 'stale_input', message: 'private-message', token: 'private-token', host: 'private-host' }; };
    await f.session.drive({ x: 0, y: -.4 }); await f.session.drive({ x: 0, y: -.8 });
    assert.equal(f.session.state.phase, 'error'); assert.equal(f.session.state.leaseActive, false);
    assert.equal(lines.length, 1);
    assert.equal(lines[0], 'DOSO_CONTROL_FAILURE code=stale_input phase=armed seq=1 inputAgeMs=0');
    assert.equal(f.calls.filter(call => call[0] === 'interrupt').length, 1);
    assert.equal(f.calls.filter(call => call[0] === 'close').length, 1);
  } finally { await f.session.disconnect(); }
});

test('an unknown failure code cannot inject log contents and logger exceptions cannot prevent cleanup', async t => {
  const lines = []; const logger = t.mock.method(console, 'info', text => lines.push(text));
  for (const throws of [false, true]) {
    const f = fixture();
    try {
      await f.session.connect(endpoint, 'fixture');
      f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
      logger.mock.mockImplementation(text => { lines.push(text); if (throws) throw new Error('private logger'); });
      f.transport.input = async () => { throw { code: 'private\ncode', message: 'private-message' }; };
      await f.session.drive({ x: 0, y: -.4 });
      assert.equal(f.session.state.phase, 'error'); assert.equal(f.session.state.leaseActive, false);
      assert.equal(f.calls.filter(call => call[0] === 'interrupt').length, 1);
      assert.equal(f.calls.filter(call => call[0] === 'close').length, 1);
    } finally { await f.session.disconnect(); }
  }
  assert.deepEqual(lines, Array(2).fill('DOSO_CONTROL_FAILURE code=unknown phase=armed seq=1 inputAgeMs=0'));
});

test('an input ACK mismatch has its own diagnostic code and is never retried', async t => {
  const lines = []; t.mock.method(console, 'info', text => lines.push(text));
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    const input = f.transport.input;
    f.transport.input = async (...args) => ({ ...await input(...args), sequence: 999 });
    await f.session.drive({ x: 0, y: -.4 });
    assert.equal(f.calls.filter(call => call[0] === 'input').length, 1);
    assert.equal(f.session.state.phase, 'error'); assert.equal(f.session.state.leaseActive, false);
    assert.deepEqual(lines, ['DOSO_CONTROL_FAILURE code=ack_mismatch phase=armed seq=1 inputAgeMs=0']);
  } finally { await f.session.disconnect(); }
});

test('busy outside the input dispatch path still retires the session', async t => {
  const lines = []; t.mock.method(console, 'info', text => lines.push(text));
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    f.transport.read = async () => { throw { code: 'busy' }; };
    await f.session.refresh();
    assert.equal(f.session.state.phase, 'error'); assert.equal(f.session.state.leaseActive, false);
    assert.equal(f.calls.filter(call => call[0] === 'interrupt').length, 1);
    assert.equal(f.calls.filter(call => call[0] === 'close').length, 1);
    assert.deepEqual(lines, ['DOSO_CONTROL_FAILURE code=busy phase=armed seq=1 inputAgeMs=1000']);
  } finally { await f.session.disconnect(); }
});

test('dispatched input failures never retry the target or reacquire control', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  t.mock.method(console, 'info', () => {});
  for (const code of ['timeout', 'unavailable', 'command_rejected', 'not_armed']) {
    const f = fixture(); let attempts = 0;
    try {
      await f.session.connect(endpoint, 'fixture');
      f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
      f.transport.input = async () => { attempts++; throw { code }; };
      await f.session.drive({ x: 0, y: -.4 });
      f.advance(200); t.mock.timers.tick(200); await tick();
      await f.session.drive({ x: 0, y: -.8 });
      assert.equal(attempts, 1, code); assert.equal(f.session.state.leaseActive, false, code);
      assert.equal(f.calls.filter(call => call[0] === 'acquire').length, 1, code);
      assert.equal(f.calls.filter(call => call[0] === 'interrupt').length, 1, code);
    } finally { await f.session.disconnect(); }
  }
});

test('latest motion replaces only the pending target and retains the physical sample time', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  for (const physical of [false, true]) {
    const f = fixture(); const timestamps = []; let finish;
    try {
      await f.session.connect(endpoint, 'fixture');
      f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
      const input = f.transport.input;
      f.transport.input = async (...args) => {
        timestamps.push(args[4]); const reply = await input(...args);
        return timestamps.length === 1 ? new Promise(resolve => { finish = () => resolve(reply); }) : reply;
      };
      const first = f.session.sticks({ x: 0, y: -.2 }, { x: 0, y: 0 }, physical ? 900 : undefined); await tick();
      f.advance(10); await f.session.sticks({ x: 0, y: -.4 }, { x: .2, y: 0 }, physical ? 910 : undefined);
      f.advance(10); await f.session.sticks({ x: .5, y: -.8 }, { x: -.5, y: 0 }, physical ? 920 : undefined);
      assert.equal(f.calls.filter(call => call[0] === 'input').length, 1);
      finish(); await first;
      assert.equal(f.calls.filter(call => call[0] === 'input').length, 1, 'ACK completion cannot dispatch queued input');
      t.mock.timers.tick(20); await tick();
      assert.deepEqual(f.calls.filter(call => call[0] === 'input'), [
        ['input', .2, 0, 0], ['input', .8, -.5, .5],
      ]);
      assert.deepEqual(timestamps, physical ? [900, 920] : [undefined, undefined]);
      assert.equal(f.session.state.sequence, 3, 'overwritten source targets must not consume wire sequence numbers');
    } finally { await f.session.disconnect(); }
  }
});

test('latest motion expires while waiting for ACK instead of receiving a new timestamp', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); let finish;
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    const input = f.transport.input;
    f.transport.input = async (...args) => { const reply = await input(...args); return new Promise(resolve => { finish = () => resolve(reply); }); };
    const first = f.session.drive({ x: 0, y: -.2 }); await tick();
    f.advance(10); await f.session.drive({ x: 0, y: -.8 }); f.advance(151);
    finish(); await first;
    t.mock.timers.tick(20); await tick();
    assert.equal(f.calls.filter(call => call[0] === 'input').length, 1);
    assert.equal(f.session.state.leaseActive, false);
    assert.ok(f.calls.some(call => call[0] === 'interrupt'));
  } finally { await f.session.disconnect(); }
});

test('latest motion is discarded when the preceding ACK rejects sequence or authority', async () => {
  for (const rejected of ['sequence', 'lease']) {
    const f = fixture(); let finish;
    try {
      await f.session.connect(endpoint, 'fixture');
      f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
      const input = f.transport.input;
      f.transport.input = async (...args) => {
        const reply = await input(...args);
        return new Promise(resolve => { finish = () => resolve(rejected === 'sequence'
          ? { ...reply, sequence: 999 } : { ...reply, leaseActive: false }); });
      };
      const first = f.session.drive({ x: 0, y: -.2 }); await tick();
      await f.session.drive({ x: 0, y: -.8 }); finish(); await first;
      assert.equal(f.calls.filter(call => call[0] === 'input').length, 1, rejected);
      assert.equal(f.session.state.phase, 'error', rejected);
      assert.equal(f.session.state.leaseActive, false, rejected);
    } finally { await f.session.disconnect(); }
  }
});

test('latest motion retains each contributing touch axis age while waiting', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); let finish;
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    const input = f.transport.input;
    f.transport.input = async (...args) => { const reply = await input(...args); return new Promise(resolve => { finish = () => resolve(reply); }); };
    const first = f.session.drive({ x: 0, y: -.2 }); await tick();
    f.advance(100); await f.session.turn({ x: .5, y: 0 }); f.advance(60);
    finish(); await first;
    t.mock.timers.tick(20); await tick();
    assert.equal(f.calls.filter(call => call[0] === 'input').length, 1);
    assert.equal(f.session.state.leaseActive, false, 'a recent turn must not renew the older nonzero drive axis');
  } finally { await f.session.disconnect(); }
});

test('latest motion after a status read sends only the newest still-authorized target', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  for (const revoked of [false, true]) {
    const f = fixture(); let finish;
    try {
      await f.session.connect(endpoint, 'fixture');
      f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
      f.transport.read = () => new Promise(resolve => { finish = () => resolve(f.reply()); });
      const read = f.session.refresh();
      await f.session.sticks({ x: 0, y: -.2 }, { x: 0, y: 0 }, 900);
      await f.session.sticks({ x: 0, y: -.8 }, { x: -.5, y: 0 }, 920);
      assert.equal(f.calls.some(call => call[0] === 'input'), false);
      if (revoked) await f.transport.interrupt();
      finish(); await read;
      assert.equal(f.calls.some(call => call[0] === 'input'), false, 'read completion cannot dispatch queued input');
      f.advance(20); t.mock.timers.tick(20); await tick();
      assert.deepEqual(f.calls.filter(call => call[0] === 'input'), revoked ? [] : [['input', .8, 0, .5]]);
    } finally { await f.session.disconnect(); }
  }
});

test('latest motion is cleared by neutral, retirement and replacement before a late ACK', async () => {
  for (const cancel of ['neutral', 'interrupt', 'disconnect', 'replace']) {
    const f = fixture(); let finish;
    try {
      await f.session.connect(endpoint, 'fixture');
      f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
      const input = f.transport.input;
      f.transport.input = async (...args) => { const reply = await input(...args); return new Promise(resolve => { finish = () => resolve(reply); }); };
      const first = f.session.drive({ x: 0, y: -.2 }); await tick();
      await f.session.drive({ x: 0, y: -.8 });
      if (cancel === 'neutral') await f.session.drive({ x: 0, y: 0 });
      else if (cancel === 'replace') await f.session.connect(endpoint, 'replacement');
      else await f.session[cancel]();
      finish(); await first;
      assert.equal(f.calls.filter(call => call[0] === 'input').length, 1, cancel);
      assert.equal(f.session.state.leaseActive, false, cancel);
    } finally { await f.session.disconnect(); }
  }
});

test('latest motion cannot survive a protected action queued behind a status read', async () => {
  const f = fixture(); let finish;
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    f.transport.read = () => new Promise(resolve => { finish = () => resolve(f.reply()); });
    const read = f.session.refresh();
    await f.session.drive({ x: 0, y: -.8 });
    const action = f.session.action('disable'); finish(); await read; await action;
    assert.equal(f.calls.some(call => call[0] === 'input'), false);
    assert.equal(f.session.state.status.motorOutputEnabled, false);
  } finally { await f.session.disconnect(); }
});

test('latest motion expiry after polling publishes an unconfirmed stop without rejecting the poll', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); let finish;
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    f.transport.read = () => new Promise(resolve => { finish = () => resolve(f.reply()); });
    const read = f.session.refresh(); await f.session.drive({ x: 0, y: -.8 }); f.advance(151);
    f.transport.interrupt = async () => { throw { code: 'stop_unconfirmed' }; };
    finish(); await assert.doesNotReject(read);
    t.mock.timers.tick(20); await tick();
    assert.equal(f.calls.some(call => call[0] === 'input'), false);
    assert.equal(f.session.state.phase, 'error');
    assert.match(f.session.state.error, /停止请求未确认/);
    assert.equal(f.session.state.leaseActive, false);
  } finally { await f.session.disconnect(); }
});

test('latest motion neutral interrupts a status read and discards its queued movement', async () => {
  const f = fixture(); let finish;
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    const oldReply = f.reply(); f.transport.read = () => new Promise(resolve => { finish = () => resolve(oldReply); });
    const read = f.session.refresh(); await f.session.drive({ x: 0, y: -.8 });
    await f.session.drive({ x: 0, y: 0 });
    assert.equal(f.session.state.leaseActive, false, 'neutral must not wait behind the status RPC');
    finish(); await read;
    assert.equal(f.calls.filter(call => call[0] === 'input').length, 0);
    assert.equal(f.session.state.leaseActive, false);
  } finally { await f.session.disconnect(); }
});

test('20ms held neutral stays armed across a pending status read and uses the next live sample', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); let finish;
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    f.transport.read = () => new Promise(resolve => { finish = () => resolve(f.reply()); });
    const reading = f.session.refresh();
    const held = setInterval(() => { void f.session.drive({ x: 0, y: 0 }); }, 20);
    try {
      for (let sample = 0; sample < 12; sample++) { f.advance(20); t.mock.timers.tick(20); await tick(); }
      assert.equal(f.calls.some(call => call[0] === 'interrupt'), false);
      assert.equal(f.session.state.leaseActive, true);
      assert.equal(f.calls.filter(call => call[0] === 'input').length, 0);
      finish(); await reading;
      assert.equal(f.calls.filter(call => call[0] === 'input').length, 0, 'read completion cannot replay the cached neutral');
      f.advance(20); t.mock.timers.tick(20); await tick();
      assert.deepEqual(f.calls.filter(call => call[0] === 'input'), [['input', 0, 0, 0]]);
    } finally { clearInterval(held); finish?.(); await reading; }
  } finally { await f.session.disconnect(); }
});

test('20ms held neutral coalesces across a pending zero ACK without releasing or overlapping', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture(); let finish;
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh(); await f.session.acquire();
    const input = f.transport.input;
    f.transport.input = async (...args) => {
      const reply = await input(...args);
      return f.calls.filter(call => call[0] === 'input').length === 1
        ? new Promise(resolve => { finish = () => resolve(reply); }) : reply;
    };
    const first = f.session.drive({ x: 0, y: 0 }); await tick();
    const held = setInterval(() => { void f.session.drive({ x: 0, y: 0 }); }, 20);
    try {
      for (let sample = 0; sample < 4; sample++) { f.advance(20); t.mock.timers.tick(20); await tick(); }
      assert.equal(f.calls.some(call => call[0] === 'interrupt'), false);
      assert.equal(f.calls.filter(call => call[0] === 'input').length, 1);
      assert.equal(f.session.state.leaseActive, true);
      finish(); await first;
      assert.equal(f.calls.filter(call => call[0] === 'input').length, 1, 'zero ACK cannot trigger replay');
      f.advance(20); t.mock.timers.tick(20); await tick();
      assert.deepEqual(f.calls.filter(call => call[0] === 'input'), [['input', 0, 0, 0], ['input', 0, 0, 0]]);
      assert.equal(f.session.state.leaseActive, true);
    } finally { clearInterval(held); finish?.(); await first; }
  } finally { await f.session.disconnect(); }
});

test('the live control session preserves advertised terrain slots and dispatches actual model IDs', async () => {
  const f = fixture({ current: 'w5_89999', available: ['w5_89999', 'cts_v39_61128'],
    descriptions: ['flat: W5', 'stairs: CTS'], currentDescription: 'flat: W5' });
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    const state = f.session.runtimeState;
    assert.deepEqual(state.currentPolicy, { id: 'w5_89999', label: 'flat: W5' });
    assert.deepEqual(state.policyOptions, [
      { id: 'w5_89999', label: 'flat: W5', terrainModeId: 'flat' },
      { id: 'cts_v39_61128', label: 'stairs: CTS', terrainModeId: 'stairs' },
    ]);
    assert.equal(state.terrainMode.current, 'flat');
    assert.equal(state.terrainMode.source, 'device');
    assert.deepEqual(getControlTerrainModeOptions(state).map(option => option.id), ['flat', 'stairs']);
    assert.deepEqual(getControlTerrainPolicies(state).map(option => option.profileId), ['w5_89999', 'cts_v39_61128', null]);
    await f.session.action('switch-profile', 'cts_v39_61128');
    assert.deepEqual(f.calls.find(call => call[0] === 'action'), ['action', 'switch-profile', 'cts_v39_61128']);
    f.advance(1500);
    assert.equal(f.session.runtimeState.currentPolicy, null);
    assert.deepEqual(f.session.runtimeState.policyOptions, []);
    assert.equal(f.session.runtimeState.terrainMode, undefined);
    assert.deepEqual(getControlTerrainModeOptions(f.session.runtimeState), []);
  } finally { f.session.dispose(); }
});

test('the live control session does not select or offer an ambiguous terrain slot', async () => {
  const f = fixture({ current: 'w5_89999', available: ['w5_89999', 'w5_other', 'cts_v39_61128'],
    descriptions: ['flat: W5', 'flat: Other', 'stairs: CTS'], currentDescription: 'flat: W5' });
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    const state = f.session.runtimeState;
    assert.equal(state.terrainMode.current, null);
    assert.deepEqual(getControlTerrainModeOptions(state).map(option => option.id), ['stairs']);
    assert.equal(getControlTerrainPolicies(state).find(option => option.id === 'flat').profileId, null);
  } finally { f.session.dispose(); }
});

test('Walking needs an explicit stand after confirmed lease release; release and refresh never stand automatically', async () => {
  const f = fixture();
  f.set({ fsmKind: 'walking', motorOutputEnabled: true });
  await f.session.connect(endpoint, 'doso-g20@robot');
  assert.equal(f.session.runtimeState.posture, 'unknown', 'Walking must not complete a fixed-pose stand');
  await f.session.acquire();
  assert.equal(f.session.operationReadiness.stand.ready, false);
  await assert.rejects(f.session.action('stand-up'), /不允许/);
  await f.session.interrupt();
  await f.session.refresh();
  assert.equal(f.session.operationReadiness.stand.ready, true);
  assert.equal(f.calls.some(call => call[0] === 'action'), false);
  assert.equal(f.session.operationReadiness.switchPolicy.ready, false);
  await f.session.action('stand-up');
  assert.deepEqual(f.calls.filter(call => call[0] === 'action'), [['action', 'stand-up', undefined]]);
  assert.equal(f.session.state.status.fsmKind, 'transitioning');
  assert.equal(f.session.runtimeState.posture, 'unknown');
  f.set({ fsmKind: 'walking' }); await f.session.refresh();
  assert.equal(f.session.runtimeState.posture, 'unknown', 'a delayed Walking reply is not completion');
  f.set({ fsmKind: 'standing' }); await f.session.refresh();
  assert.equal(f.session.runtimeState.posture, 'standing');
  f.session.dispose();
});

test('Walking stand retains motor, lease, local-owner, fault, freshness and busy gates', async () => {
  for (const patch of [{ motorOutputEnabled: false }, { grpcLeaseActive: true }, { owner: 'yunzhuo' },
    { criticalMotorFault: true }, { fsmKind: 'transitioning' }, { fsmKind: 'standing' }]) {
    const f = fixture();
    f.set({ fsmKind: 'walking', motorOutputEnabled: true, ...patch });
    await f.session.connect(endpoint, 'doso-g20@robot');
    assert.equal(f.session.operationReadiness.stand.ready, false, JSON.stringify(patch));
    await assert.rejects(f.session.action('stand-up'), /不允许/);
    assert.equal(f.calls.some(call => call[0] === 'action'), false);
    f.session.dispose();
  }
  const f = fixture();
  f.set({ fsmKind: 'walking', motorOutputEnabled: true });
  await f.session.connect(endpoint, 'doso-g20@robot');
  f.advance(1500);
  assert.equal(f.session.operationReadiness.stand.ready, false);
  await assert.rejects(f.session.action('stand-up'), /不允许/);
  f.transport.read = async () => ({ ...f.reply(), profile: { current: 'flat', available: ['flat'], descriptions: [], currentDescription: '' } });
  await f.session.refresh();
  let finish;
  f.transport.action = () => new Promise(resolve => { finish = resolve; });
  const action = f.session.action('stand-up');
  assert.equal(f.session.operationReadiness.stand.ready, false);
  await assert.rejects(f.session.action('stand-up'), /上一项操作/);
  finish(f.reply()); await action;
  f.session.dispose();
});

test('a blocked status read publishes expiry once without renewing telemetry or stale policy', async () => {
  const f = fixture(); let finishRead; let changes = 0;
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
    assert.equal(f.session.prepareManualControl(), true);
    f.transport.read = () => new Promise(resolve => { finishRead = () => resolve(f.reply()); });
    const reading = f.session.refresh();
    const unsubscribe = f.session.subscribe(() => { changes++; });
    f.advance(1499); await f.session.refresh();
    assert.equal(changes, 0);
    f.advance(1); await f.session.refresh();
    assert.equal(changes, 1, 'the next existing poll must notify the UI even while a read is blocked');
    assert.equal(f.session.state.connected, true, 'expired telemetry does not prove the transport disconnected');
    assert.equal(f.session.state.status, null);
    assert.equal(f.session.state.profile, null);
    assert.equal(f.session.state.observedAt, null);
    assert.equal(f.session.state.manualPrepared, false);
    assert.equal(f.session.runtimeState.motorState, 'unknown', 'unknown must never be reported as disabled');
    assert.equal(f.session.runtimeState.currentPolicy, null);
    assert.equal(f.session.canAcquire, false);
    assert.equal(f.session.operationReadiness.sit.ready, false);
    await f.session.refresh();
    assert.equal(changes, 1, 'repeated polls must not publish the same expiry again');
    finishRead(); await reading;
    assert.equal(changes, 2);
    assert.equal(f.session.runtimeState.motorState, 'enabled');
    assert.equal(f.session.state.observedAt, 2500);
    assert.equal(f.session.runtimeState.currentPolicy, null, 'status-only replies cannot renew an expired profile');
    assert.equal(f.session.state.manualPrepared, false, 'a new observation must not restore prepared control');
    unsubscribe();
  } finally { await f.session.disconnect(); }
});

test('telemetry expiry preserves an outstanding action until its real reply', async () => {
  const f = fixture(); let finishAction; let changes = 0;
  try {
    await f.session.connect(endpoint, 'fixture');
    f.transport.action = () => new Promise(resolve => { finishAction = () => resolve(f.reply()); });
    const action = f.session.action('enable');
    const unsubscribe = f.session.subscribe(() => { changes++; });
    f.advance(1500); await f.session.refresh();
    assert.equal(changes, 1);
    assert.equal(f.session.state.phase, 'operating');
    assert.equal(f.session.runtimeState.controlLink, 'connected', 'an active action still owns its channel');
    assert.equal(f.session.runtimeState.motorState, 'unknown');
    assert.equal(f.session.operationReadiness.enableMotor.ready, false);
    await assert.rejects(f.session.action('enable'), /上一项操作/);
    f.set({ motorOutputEnabled: true }); finishAction(); await action;
    assert.equal(f.session.state.phase, 'ready');
    assert.equal(f.session.runtimeState.motorState, 'enabled');
    unsubscribe();
  } finally { await f.session.disconnect(); }
});

test('a late expired read cannot restore telemetry after connection replacement', async () => {
  const f = fixture(); let finishRead;
  try {
    await f.session.connect(endpoint, 'fixture');
    const oldReply = f.reply({ status: status({ fsmKind: 'standing', motorOutputEnabled: true }) });
    f.transport.read = () => new Promise(resolve => { finishRead = () => resolve(oldReply); });
    const reading = f.session.refresh();
    f.advance(1500); await f.session.refresh();
    assert.equal(f.session.state.status, null);
    assert.equal(await f.session.connect(endpoint, 'fixture'), true);
    const replacement = f.session.state;
    finishRead(); await reading;
    assert.equal(f.session.state, replacement);
    assert.equal(f.session.runtimeState.motorState, 'disabled');
    assert.equal(f.session.state.status.fsmKind, 'grounded');
  } finally { await f.session.disconnect(); }
});

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
    assert.equal(f.calls.some(call => call[0] === (cancel === 'interrupt' ? 'interrupt' : 'close')), true,
      'queued JS action is fenced before native cancellation or channel close');
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
    assert.equal(f.calls.some(call => call[0] === (cancel === 'interrupt' ? 'interrupt' : 'close')), true, cancel);
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
  assert.equal(await f.session.connect({ host: '192.168.66.64', port: 13145, transport: 'lan-dev' }, ''), true);
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
  await f.session.action('enable');
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

test('confirmed explicit lease release makes later native channel retirement read-only', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'fixture');
  await f.session.action('enable'); f.set({ fsmKind: 'standing' }); await f.session.refresh(); await f.session.acquire();
  await f.session.interrupt(); const stopCount = f.calls.filter(call => call[0] === 'interrupt').length;
  f.transport.interrupt = async () => { throw { code: 'cancelled' }; };
  await f.session.disconnect();
  assert.equal(f.session.state.error, null); assert.equal(f.session.state.failureCode, null);
  assert.equal(f.calls.filter(call => call[0] === 'interrupt').length, stopCount); f.session.dispose();
});

test('status-failure cleanup records an unconfirmed stop, not only the network error', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  await f.session.action('enable');
  f.transport.read = async () => { throw { code: 'unavailable' }; };
  f.transport.interrupt = async () => { throw { code: 'stop_unconfirmed' }; };
  await f.session.refresh();
  assert.match(f.session.state.error, /停止请求未确认/);
  await f.session.disconnect(); assert.match(f.session.state.error, /停止请求未确认/);
  f.session.dispose();
});

test('a failed replacement open retains the previous connection stop warning', async () => {
  const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
  await f.session.action('enable');
  f.transport.interrupt = async () => { throw { code: 'stop_unconfirmed' }; };
  f.transport.open = async () => { throw { code: 'unavailable' }; };
  assert.equal(await f.session.connect({ ...endpoint, host: '192.0.2.2' }, 'doso-g20@robot'), false);
  assert.match(f.session.state.error, /停止请求未确认/);
  f.session.dispose();
});

test('repeated disconnects retain late stop failure, while a new verified connection retires it', async () => {
  for (const replace of [false, true]) {
    const f = fixture(); await f.session.connect(endpoint, 'doso-g20@robot');
    await f.session.action('enable');
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

test('operator directions follow Brainstem body coordinates: forward, left and counter-clockwise positive', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  // brainstem_api/README.md coordinates and cms.proto WalkRequest physical units.
  // The SDK learns screen/operator right as +X, which is negative body Y / angular Z.
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'doso-g20@robot'); await f.session.action('enable');
    f.set({ fsmKind: 'standing', transition: 'none' }); await f.session.refresh(); await f.session.acquire();
    for (const [name, drive, turn, expected] of [
      ['forward', { x: 0, y: -1 }, { x: 0, y: 0 }, [1, 0, 0]],
      ['back', { x: 0, y: 1 }, { x: 0, y: 0 }, [-1, 0, 0]],
      ['left', { x: -1, y: 0 }, { x: 0, y: 0 }, [0, 1, 0]],
      ['right', { x: 1, y: 0 }, { x: 0, y: 0 }, [0, -1, 0]],
      ['left turn', { x: 0, y: 0 }, { x: -1, y: 0 }, [0, 0, 1]],
      ['right turn', { x: 0, y: 0 }, { x: 1, y: 0 }, [0, 0, -1]],
    ]) {
      await f.session.sticks(drive, turn, 900);
      f.advance(20); t.mock.timers.tick(20); await tick();
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
  assert.deepEqual(values[0], ['input', .5, -.4, .25]);
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
  assert.deepEqual(f.calls.find(c => c[0] === 'input'), ['input', 1, -.5, 0]);
  assert.equal(f.session.state.sequence, 2);
  assert.deepEqual(f.session.runtimeState.speed, { source: 'command', linearMps: 1, lateralMps: -.5, yawRps: 0 });
  await f.session.disconnect();
});

test('idle connected target speed is zero, but stale, disconnected and external ownership stay unknown', async () => {
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    assert.deepEqual(f.session.runtimeState.speed, { source: 'command', linearMps: 0, lateralMps: 0, yawRps: 0 });
    f.set({ owner: 'yunzhuo' }); await f.session.refresh(); assert.equal(f.session.runtimeState.speed.source, 'unknown');
    f.set({ owner: 'none' }); await f.session.refresh(); f.advance(1501); assert.equal(f.session.runtimeState.speed.source, 'unknown');
    await f.session.disconnect(); assert.equal(f.session.runtimeState.speed.source, 'unknown');
  } finally { await f.session.disconnect(); }
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
  assert.deepEqual(f.calls.find(c => c[0] === 'input'), ['input', 0, -.5, 0]);
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

test('touch readiness needs no prepare button, but neutral never acquires and pre-ACK movement is discarded', async () => {
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
    assert.equal(f.session.canBeginTouchControl, true);
    assert.equal(f.session.canBeginManualControl, false);
    f.session.prepareManualControl();
    await f.session.drive({ x: 0, y: 0 });
    assert.equal(f.calls.some(c => c[0] === 'acquire'), false);
    await f.session.drive({ x: 0, y: -.5 });
    assert.equal(f.calls.some(c => c[0] === 'input'), false);
    await f.session.drive({ x: 0, y: -.4 });
    const reads = f.calls.filter(c => c[0] === 'read').length;
    await f.session.refresh();
    assert.equal(f.calls.filter(c => c[0] === 'read').length, reads, 'live ACKs supply status without competing polling');
    await f.session.interrupt();
    assert.equal(f.session.canBeginTouchControl, true);
    await f.session.drive({ x: 0, y: -.8 });
    assert.equal(f.calls.filter(c => c[0] === 'acquire').length, 1, 'old held samples cannot prepare another gesture');
  } finally { await f.session.disconnect(); }
});

test('motion timeout retains connection only after confirmed release, and never resumes held input', async () => {
  for (const confirmed of [true, false]) {
    const f = fixture();
    try {
      await f.session.connect(endpoint, 'fixture');
      f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
      f.session.prepareManualControl(); await f.session.drive({ x: 0, y: -.5 });
      f.transport.input = async () => { throw { code: 'timeout' }; };
      if (!confirmed) f.transport.interrupt = async () => { throw { code: 'stop_unconfirmed' }; };
      await f.session.drive({ x: 0, y: -.5 }).catch(() => {});
      assert.equal(f.session.state.connected, confirmed);
      assert.equal(f.session.state.manualPrepared, false);
      assert.equal(f.session.state.leaseActive, false);
      assert.equal(f.session.state.failureCode, confirmed ? 'timeout' : 'stop_unconfirmed');
      await f.session.drive({ x: 0, y: -.8 });
      assert.equal(f.calls.filter(c => c[0] === 'acquire').length, 1);
    } finally { await f.session.disconnect(); }
  }
});

test('normal touch release sends zero without releasing a healthy lease; pending acquire is cancelled', async () => {
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ motorOutputEnabled: true }); await f.session.refresh();
    assert.equal(f.session.touchBlockedReason, '请先站立');
    f.set({ fsmKind: 'standing' }); await f.session.refresh();
    assert.equal(f.session.touchBlockedReason, null);
    f.session.prepareManualControl(); await f.session.drive({ x: 0, y: -.5 });
    await f.session.drive({ x: 0, y: -.5 });
    await f.session.endTouchGesture();
    assert.deepEqual(f.calls.filter(c => c[0] === 'input').at(-1), ['input', 0, 0, 0]);
    assert.equal(f.session.state.leaseActive, true);
    assert.equal(f.calls.some(c => c[0] === 'interrupt'), false);
    await f.session.interrupt();
    f.session.prepareManualControl();
    const acquire = f.transport.acquire; let complete;
    f.transport.acquire = async () => { const reply = await acquire(); return new Promise(resolve => { complete = () => resolve(reply); }); };
    const pending = f.session.drive({ x: 0, y: -.5 }); await tick();
    await f.session.endTouchGesture(); complete(); await pending;
    assert.equal(f.session.state.leaseActive, false);
    assert.equal(f.session.state.manualPrepared, false);
  } finally { await f.session.disconnect(); }
});

test('released touch renews only zero and stops renewing after explicit cancellation', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const f = fixture();
  try {
    await f.session.connect(endpoint, 'fixture');
    f.set({ fsmKind: 'standing', motorOutputEnabled: true }); await f.session.refresh();
    f.session.prepareManualControl(); await f.session.drive({ x: 0, y: -.5 });
    await f.session.drive({ x: 0, y: -.5 }); await f.session.endTouchGesture();
    const before = f.calls.filter(c => c[0] === 'input').length;
    for(let i=0;i<20;i++){f.advance(20);t.mock.timers.tick(20);await tick();}
    const idle = f.calls.filter(c => c[0] === 'input').slice(before);
    assert.equal(idle.length, 4);
    assert.ok(idle.every(c => c.slice(1).every(value => value === 0)));
    await f.session.interrupt();
    const stopped = f.calls.length;
    for(let i=0;i<20;i++){f.advance(20);t.mock.timers.tick(20);await tick();}
    assert.equal(f.calls.length, stopped);
  } finally { await f.session.disconnect(); }
});

function slotProfile(version = 'v1', activeModeId = 'flat') {
  return { current: `flat_${version}`, available: [`flat_${version}`, `stairs_${version}`],
    descriptions: ['stairs: misleading', 'flat: misleading'], currentDescription: 'diagnostics', activeModeId,
    modeCapabilities: ['flat', 'stairs'].map(id => ({ id, kind: 'locomotion', available: true,
      availability: 'available', label: '', unavailableReason: '', profileId: `${id}_${version}` })) };
}

test('motion slot commands and UI selection remain unchanged after robot model replacement', async () => {
  for (const version of ['v1', 'replacement']) {
    const profile = slotProfile(version);
    const f = fixture(profile);
    f.transport.action = async (id, action, slot) => {
      f.calls.push(['action', action, slot]);
      return f.reply({ profile: { ...profile, current: `${slot}_${version}`, activeModeId: slot } });
    };
    try {
      await f.session.connect(endpoint, 'doso-g20@robot');
      assert.equal(f.session.runtimeState.currentPolicy.id, 'flat');
      assert.deepEqual(getControlTerrainPolicies(f.session.runtimeState).map(mode => mode.profileId), ['flat', 'stairs', null]);
      for (const target of ['stairs', 'flat']) {
        await f.session.action('switch-profile', target);
        assert.equal(f.session.runtimeState.currentPolicy.id, target);
        assert.equal(f.session.runtimeState.terrainMode.current, target);
      }
      assert.deepEqual(f.calls.filter(call => call[0] === 'action'), [
        ['action', 'switch-profile', 'stairs'], ['action', 'switch-profile', 'flat'],
      ]);
      assert.equal(f.calls.some(call => call[0] === 'acquire' || call[0] === 'input'), false);
    } finally { f.session.dispose(); }
  }
});

test('modern capability validation rejects model IDs and unavailable or ambiguous slot IDs before dispatch', async () => {
  for (const change of ['model', 'unavailable', 'unknown', 'duplicate']) {
    const profile = slotProfile();
    let target = 'stairs';
    if (change === 'model') target = 'stairs_v1';
    if (change === 'unavailable') { profile.modeCapabilities[1].available = false; profile.modeCapabilities[1].availability = 'unavailable'; }
    if (change === 'unknown') target = 'platform';
    if (change === 'duplicate') profile.modeCapabilities.push({ ...profile.modeCapabilities[1], kind: 'recovery-action' });
    const f = fixture(profile);
    try {
      await f.session.connect(endpoint, 'doso-g20@robot');
      await assert.rejects(f.session.action('switch-profile', target));
      assert.equal(f.calls.some(call => call[0] === 'action'), false);
    } finally { f.session.dispose(); }
  }
});

test('modern switch must confirm the active slot rather than an echoed model name', async () => {
  for (const active of ['flat', '', undefined]) {
    const profile = slotProfile(); const f = fixture(profile);
    f.transport.action = async () => f.reply({ profile: { ...profile, current: 'stairs', activeModeId: active } });
    try {
      await f.session.connect(endpoint, 'doso-g20@robot');
      await assert.rejects(f.session.action('switch-profile', 'stairs'));
      assert.equal(f.session.state.phase, 'error');
      assert.equal(f.session.runtimeState.currentPolicy, null);
    } finally { f.session.dispose(); }
  }
});


test('recovery commands stay on the open session and heartbeats follow selection', async () => {
  const f = fixture();
  const beats = [];
  const base = { service: 'ready', modelConfigured: true, enableSequenceVerified: true, stableStand: false, locomotionAvailable: false, activeModeId: '', reason: 'none', detail: '', heartbeatFresh: false, heartbeatError: null };
  f.transport.readRecovery = async () => ({ ...base, phase: 'absent', sessionSelected: false });
  f.transport.recoveryCommand = async (_id, command) => ({ ...base, phase: command === 'enter' ? 'selected' : 'stable-stand', sessionSelected: command !== 'exit', heartbeatFresh: true });
  f.transport.setRecoveryHeartbeat = (id, enabled) => { beats.push([id, enabled]); };
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    await f.session.refreshRecovery();
    assert.equal(f.session.recoveryStatus.sessionSelected, false);
    assert.deepEqual(beats, []);
    await f.session.recoveryCommand('enter');
    assert.equal(f.session.recoveryStatus.phase, 'selected');
    assert.deepEqual(beats, [['s1', true]]);
    await f.session.disconnect();
    assert.deepEqual(beats.at(-1), ['s1', false]);
  } finally { f.session.dispose(); }
});

test('one tap enters, starts the heartbeat, then enables and starts without leaving through a profile switch', async () => {
  const f = fixture();
  const beats = [];
  const commands = [];
  const base = { service: 'ready', modelConfigured: true, enableSequenceVerified: true, stableStand: false, locomotionAvailable: false, activeModeId: '', reason: 'none', detail: '', heartbeatFresh: true, heartbeatError: null };
  f.transport.recoveryCommand = async (_id, command) => {
    commands.push(command);
    if (command === 'enter') return { ...base, phase: 'selected', sessionSelected: true };
    if (command === 'enable') return { ...base, phase: 'enabled', sessionSelected: true };
    if (command === 'start') return { ...base, phase: 'getting-up', sessionSelected: true };
    if (command === 'exit') return { ...base, phase: 'absent', sessionSelected: false, stableStand: true, locomotionAvailable: true };
    throw new Error(command);
  };
  f.transport.setRecoveryHeartbeat = (id, enabled) => { beats.push([id, enabled, commands.slice()]); };
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    assert.deepEqual(commands, []);
    await beginRobotRecovery(command => f.session.recoveryCommand(command));
    assert.deepEqual(commands, ['enter', 'enable', 'start']);
    assert.deepEqual(beats[0], ['s1', true, ['enter']]);
    assert.equal(f.calls.some(call => call[0] === 'action' && call[1] === 'switch-profile'), false);
    const direct = [];
    f.transport.recoveryCommand = async (_id, command) => {
      direct.push(command);
      return { ...base, phase: 'enabled', sessionSelected: true };
    };
    await beginRobotRecovery(command => f.session.recoveryCommand(command));
    assert.deepEqual(direct, ['enter', 'start']);
  } finally { f.session.dispose(); }
});

test('ListenImu samples stay on the live session and drop when the stream or the clock goes stale', async () => {
  const f = fixture();
  let emit = null;
  let stopped = 0;
  f.transport.listenImu = (_id, onSample) => {
    emit = onSample;
    return () => { stopped += 1; emit = null; };
  };
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    assert.equal(f.session.runtimeState.imu, undefined);
    assert.equal(f.session.runtimeState.controlOwner, 'none');
    emit({ gyroX: 0.2, gyroY: -0.1, gyroZ: 0.3, quatW: 1, quatX: 0, quatY: 0, quatZ: 0, timestampMs: 40 });
    assert.equal(f.session.runtimeState.imu.linearAcceleration, null);
    assert.equal(f.session.runtimeState.imu.gyroscope.x, 0.2);
    assert.equal(f.session.runtimeState.imu.quaternion.w, 1);
    emit({ gyroX: 0, gyroY: 0, gyroZ: 0, quatW: 1, quatX: 0, quatY: 0, quatZ: 0, accelX: 0, accelY: 0, accelZ: 9.8 });
    assert.equal(f.session.runtimeState.imu.linearAcceleration.z, 9.8);
    emit({ gyroX: 0, gyroY: 0, gyroZ: 0, quatW: 1, quatX: 0, quatY: 0, quatZ: 0, accelX: 1 });
    assert.equal(f.session.runtimeState.imu.linearAcceleration.z, 9.8, 'a partial acceleration sample must not replace a real one');
    f.advance(1000);
    assert.equal(f.session.runtimeState.imu, undefined);
    assert.equal(f.session.runtimeState.speed.source, 'command');
    await f.session.disconnect();
    assert.equal(stopped, 1);
    assert.equal(emit, null);
  } finally { f.session.dispose(); }
});

test('playGesture strictly disallows Grounded even with motors enabled and allows only Standing without active lease', async () => {
  const profile = slotProfile();
  profile.modeCapabilities.push({
    id: 'height', kind: 'body-height', available: true, availability: 'available',
    label: '身高控制', profileId: 'single_frame_height_v2', unavailableReason: '',
  });
  const f = fixture(profile);
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    for (const disallowed of [
      { fsmKind: 'grounded', motorOutputEnabled: false },
      { fsmKind: 'grounded', motorOutputEnabled: true },
      { fsmKind: 'zero', motorOutputEnabled: true },
      { fsmKind: 'walking', motorOutputEnabled: true },
      { fsmKind: 'transitioning', motorOutputEnabled: true },
      { fsmKind: 'standing', motorOutputEnabled: false },
      { fsmKind: 'standing', motorOutputEnabled: true, grpcLeaseActive: true },
    ]) {
      f.set({ grpcLeaseActive: false, ...disallowed });
      await f.session.refresh();
      assert.equal(f.session.operationReadiness.playGesture.ready, false, JSON.stringify(disallowed));
      await assert.rejects(f.session.action('play-gesture', 'nod_yes'), /机器狗当前状态不允许/);
    }
    assert.equal(f.calls.some(call => call[0] === 'action'), false);

    // Body-height capability stays out of locomotion terrain tabs while remaining switchable via SwitchProfile.
    f.set({ fsmKind: 'standing', motorOutputEnabled: true, grpcLeaseActive: false });
    await f.session.refresh();
    assert.equal(f.session.runtimeState.policyOptions.some(opt => opt.id === 'height'), false);
    assert.equal(getControlTerrainPolicies(f.session.runtimeState).some(opt => opt.profileId === 'height'), false);

    assert.equal(f.session.operationReadiness.playGesture.ready, true);
    await f.session.action('play-gesture', 'nod_yes');
    assert.deepEqual(f.calls.filter(call => call[0] === 'action'), [['action', 'play-gesture', 'nod_yes']]);
  } finally {
    f.session.dispose();
  }
});

test('latencyMs tracks fresh RPC round-trip time, IMU notify gate suppresses idle re-renders, and refreshRecovery skips busy/active-lease collisions', async () => {
  const f = fixture();
  let emitImu = null;
  f.transport.listenImu = (_id, cb) => { emitImu = cb; return () => { emitImu = null; }; };
  f.transport.open = async (target, principal) => {
    f.advance(7);
    return { ...f.reply(), leaseActive: false, principalVerified: false, sessionId: 's1', transport: 'grpc-mtls', mutualTlsVerified: true,
      profile: { current: 'flat', available: ['flat'], descriptions: [], currentDescription: '' } };
  };
  f.transport.read = async () => { f.advance(5); return f.reply(); };
  let recoveryReads = 0;
  const baseRec = { service: 'ready', phase: 'absent', modelConfigured: true, enableSequenceVerified: true, sessionSelected: false, stableStand: false, locomotionAvailable: false, activeModeId: '', reason: 'none', detail: '', heartbeatFresh: false, heartbeatError: null };
  f.transport.readRecovery = async () => { recoveryReads++; return { ...baseRec }; };
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    assert.equal(f.session.latencyMs, 7);
    await f.session.refresh();
    assert.equal(f.session.latencyMs, 5);

    let notifications = 0;
    const unsub = f.session.subscribe(() => { notifications++; });
    await f.session.refreshRecovery();
    assert.equal(notifications, 1);
    await f.session.refreshRecovery();
    assert.equal(notifications, 1, 'identical recovery status must not re-render UI');

    f.transport.readRecovery = async () => { throw { code: 'busy' }; };
    await f.session.refreshRecovery();
    assert.equal(notifications, 1, 'transient bridge busy must not wipe recovery or notify');
    assert.equal(f.session.recoveryStatus?.service, 'ready');

    f.session.setImuNotifyEnabled(false);
    emitImu({ gyroX: 0.1, gyroY: 0, gyroZ: 0, quatW: 1, quatX: 0, quatY: 0, quatZ: 0 });
    assert.equal(notifications, 1, 'IMU sample stored silently when notify gate disabled');
    assert.equal(f.session.runtimeState.imu?.gyroscope.x, 0.1);
    f.session.setImuNotifyEnabled(true);
    assert.equal(notifications, 2, 'enabling IMU notify publishes fresh sample immediately');

    // Active lease blocks non-recovery polling so 50Hz motion is never starved
    f.transport.readRecovery = async () => { recoveryReads++; return { ...baseRec }; };
    f.set({ fsmKind: 'standing', motorOutputEnabled: true });
    await f.session.refresh();
    await f.session.acquire();
    const beforeLeasePoll = recoveryReads;
    await f.session.refreshRecovery();
    assert.equal(recoveryReads, beforeLeasePoll);

    unsub();
    f.advance(1600);
    assert.equal(f.session.latencyMs, null, 'stale session clears latencyMs');
  } finally {
    f.session.dispose();
  }
});

test('speedMode queries device mode, scales high-speed walk vectors to 2.5 m/s, and marks unimplemented cleanly', async () => {
  const f = fixture();
  let deviceSpeedMode = 'normal';
  f.transport.getSpeedMode = async () => deviceSpeedMode;
  f.transport.setSpeedMode = async (_id, next) => {
    deviceSpeedMode = next;
    return { ...f.reply({ leaseActive: false, principalVerified: true }), speedMode: next };
  };
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    await f.session.refreshSpeedMode();
    assert.equal(f.session.speedMode, 'normal');

    f.set({ fsmKind: 'standing', motorOutputEnabled: true });
    await f.session.refresh();
    await f.session.setSpeedMode('high');
    assert.equal(f.session.speedMode, 'high');

    await f.session.acquire();
    await f.session.drive({ x: 0, y: -1 });
    assert.deepEqual(f.calls.filter(c => c[0] === 'input').at(-1), ['input', 2.5, 0, 0]);
  } finally {
    f.session.dispose();
  }
});

test('apply() suppresses idle no-op poll re-renders and throttles 50Hz walking UI notifications while keeping state synchronous', async () => {
  const f = fixture();
  let rtt = 12;
  f.transport.read = async () => { f.advance(rtt); return f.reply(); };
  f.transport.input = async (id, forward, lateral, yaw) => {
    f.advance(8);
    f.calls.push(['input', forward, lateral, yaw]);
    const nextSeq = (f.session.state.sequence || 1) + 1;
    return f.reply({ sequence: nextSeq });
  };
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    f.advance(500);
    await f.session.refresh(); // records baseline 12ms latency at steady-state poll interval
    assert.equal(f.session.latencyMs, 12);
    let notifications = 0;
    const unsub = f.session.subscribe(() => { notifications++; });

    // 1. Identical idle polls with +-1ms RTT jitter must not trigger full-tree React re-renders,
    // while observedAt still advances synchronously so freshness never expires.
    const beforeObserved = f.session.state.observedAt;
    rtt = 13;
    f.advance(500);
    await f.session.refresh();
    assert.equal(notifications, 0, 'identical idle poll with 1ms jitter skips UI notification');
    assert.ok(f.session.state.observedAt > beforeObserved, 'observedAt still updates synchronously');
    assert.equal(f.session.latencyMs, 13);

    // 2. Meaningful RTT shift (>=3ms after >=500ms) DOES notify UI so HUD RTT stays responsive.
    rtt = 20;
    f.advance(500);
    await f.session.refresh();
    assert.equal(notifications, 1, 'meaningful RTT shift notifies HUD');

    // 3. Real posture/motor change always notifies immediately with zero throttling.
    f.set({ fsmKind: 'standing', motorOutputEnabled: true });
    f.advance(100);
    await f.session.refresh();
    assert.equal(notifications, 2, 'real state change notifies immediately');

    // 4. During 50Hz walking, 5 consecutive ACKs over ~100ms update sequence synchronously every frame
    // while capping UI re-renders to <=10Hz (at most 2 notifications across 5 frames).
    await f.session.acquire();
    const afterAcquire = notifications;
    for (let i = 1; i <= 5; i++) {
      f.advance(20);
      await f.session.drive({ x: 0, y: -0.2 * i });
      if (i < 5) await new Promise(resolve => setTimeout(resolve, 25));
    }
    await new Promise(resolve => setTimeout(resolve, 25));
    assert.ok(f.session.state.sequence >= 5, `50Hz WalkChecked sequences advance synchronously (got ${f.session.state.sequence})`);
    assert.ok(notifications - afterAcquire <= 2, `50Hz walking notifications throttled (got ${notifications - afterAcquire})`);

    unsub();
  } finally {
    f.session.dispose();
  }
});

test('bodyHeight exposes fallback/advertised bounds, switches height mode cleanly, clamps SetBodyHeight, and keeps recovery blocked', async () => {
  // 1. Disconnected fallback bounds
  const idle = fixture();
  assert.deepEqual(idle.session.bodyHeight, {
    available: false, modeId: null, active: false, supported: false,
    currentHeightM: null, targetHeightM: null, defaultHeightM: 0.375, minHeightM: 0.15, maxHeightM: 0.50, rateMps: null,
  });
  idle.session.dispose();

  // 2. Live height capability with robot-advertised [0.25, 0.50] range
  const profile = {
    current: 'flat_v1',
    available: ['flat_v1', 'stairs_v1', 'single_frame_height_v2'],
    descriptions: [],
    currentDescription: '',
    activeModeId: 'flat',
    modeCapabilities: [
      { id: 'flat', kind: 'locomotion', available: true, availability: 'available', label: '', unavailableReason: '', profileId: 'flat_v1' },
      { id: 'stairs', kind: 'locomotion', available: true, availability: 'available', label: '', unavailableReason: '', profileId: 'stairs_v1' },
      {
        id: 'height', kind: 'body-height', available: true, availability: 'available', label: '', unavailableReason: '',
        profileId: 'single_frame_height_v2',
        bodyHeight: { defaultHeightM: 0.375, minHeightM: 0.25, maxHeightM: 0.50, rateMps: 0.05 },
      },
      { id: 'recovery', kind: 'recovery-action', available: true, availability: 'available', label: '', unavailableReason: '', profileId: '' },
    ],
  };
  const f = fixture(profile);
  let activeMode = 'flat';
  let currentHeight = 0.0;
  let targetHeight = 0.0;
  let heightReads = 0;
  const setHeights = [];
  f.transport.action = async (_id, action, slot) => {
    f.calls.push(['action', action, slot]);
    if (action === 'switch-profile') {
      activeMode = slot;
      if (slot === 'height') { currentHeight = 0.375; targetHeight = 0.375; }
      else { currentHeight = 0.0; targetHeight = 0.0; }
      return f.reply({ profile: { ...profile, activeModeId: activeMode, current: slot === 'height' ? 'single_frame_height_v2' : `${slot}_v1` } });
    }
    return f.reply();
  };
  f.transport.getBodyHeightStatus = async () => {
    heightReads++;
    return {
      supported: activeMode === 'height',
      currentHeightM: currentHeight,
      targetHeightM: targetHeight,
      minHeightM: 0.25,
      maxHeightM: 0.50,
      rateMps: 0.05,
    };
  };
  f.transport.setBodyHeight = async (_id, heightM) => {
    setHeights.push(heightM);
    currentHeight = heightM;
    targetHeight = heightM;
    return {
      ...f.reply({ leaseActive: false, principalVerified: true }),
      bodyHeight: { supported: true, currentHeightM: currentHeight, targetHeightM: targetHeight, minHeightM: 0.25, maxHeightM: 0.50, rateMps: 0.05 },
    };
  };
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    // Locomotion terrain tabs remain strictly flat/stairs (never height or recovery).
    assert.deepEqual(f.session.runtimeState.policyOptions.map(o => o.id), ['flat', 'stairs']);
    assert.deepEqual(getControlTerrainPolicies(f.session.runtimeState).map(o => o.profileId), ['flat', 'stairs', null]);
    assert.deepEqual(f.session.bodyHeight, {
      available: true, modeId: 'height', active: false, supported: false,
      currentHeightM: null, targetHeightM: null, defaultHeightM: 0.375, minHeightM: 0.25, maxHeightM: 0.50, rateMps: 0.05,
    });

    // Recovery stays strictly blocked from normal SwitchProfile.
    await assert.rejects(f.session.action('switch-profile', 'recovery'), /所选策略已不可用/);
    assert.equal(f.calls.some(c => c[0] === 'action'), false);

    // SetBodyHeight before entering height mode rejects with precondition without disconnecting.
    await assert.rejects(f.session.setBodyHeight(0.35), error => error.code === 'precondition');
    assert.equal(f.session.state.connected, true);

    // Enter height mode via setBodyHeightMode(true) -> switches to 'height' and refreshes GetBodyHeightStatus.
    await f.session.setBodyHeightMode(true);
    assert.equal(f.session.bodyHeight.active, true);
    assert.equal(f.session.bodyHeight.supported, true);
    assert.equal(f.session.bodyHeight.currentHeightM, 0.375);
    assert.equal(f.session.bodyHeight.targetHeightM, 0.375);
    assert.equal(heightReads, 1);

    // Out-of-bounds inputs clamp strictly to robot's advertised [0.25, 0.50] and update state immediately from reply.
    await f.session.setBodyHeight(0.15);
    assert.equal(setHeights.at(-1), 0.25);
    assert.equal(f.session.bodyHeight.targetHeightM, 0.25);
    await f.session.setBodyHeight(0.80);
    assert.equal(setHeights.at(-1), 0.50);
    assert.equal(f.session.bodyHeight.targetHeightM, 0.50);
    await f.session.setBodyHeight(0.4123);
    assert.equal(setHeights.at(-1), 0.412);
    assert.equal(f.session.bodyHeight.currentHeightM, 0.412);
    await assert.rejects(f.session.setBodyHeight(NaN), error => error.code === 'config');

    // Exit height mode via setBodyHeightMode(false) -> switches back to 'flat' and refreshes GetBodyHeightStatus.
    await f.session.setBodyHeightMode(false);
    assert.deepEqual(f.calls.filter(c => c[0] === 'action'), [
      ['action', 'switch-profile', 'height'],
      ['action', 'switch-profile', 'flat'],
    ]);
    assert.equal(f.session.bodyHeight.active, false);
    assert.equal(f.session.bodyHeight.supported, false);
    assert.equal(f.session.bodyHeight.currentHeightM, null);
    assert.equal(f.session.runtimeState.currentPolicy?.id, 'flat');

    // Direct action('switch-profile', 'height') also auto-refreshes GetBodyHeightStatus cleanly.
    const readsBeforeDirect = heightReads;
    await f.session.action('switch-profile', 'height');
    await tick();
    assert.equal(heightReads, readsBeforeDirect + 1);
    assert.equal(f.session.bodyHeight.supported, true);
  } finally {
    f.session.dispose();
  }
});

test('listGestures waits for in-flight readDone, retries up to 3x on busy, and throws immediately on unimplemented or disconnect', async () => {
  // 1. Waits for readDone before dispatching so it never collides with 500ms status poll.
  const f = fixture();
  const order = [];
  let finishRead;
  f.transport.read = () => new Promise(resolve => {
    order.push('read:start');
    finishRead = () => { order.push('read:end'); resolve(f.reply()); };
  });
  f.transport.listGestures = async () => {
    order.push('listGestures');
    return [{ name: 'nod_yes', description: '点头', durationMs: 4020 }];
  };
  try {
    await f.session.connect(endpoint, 'doso-g20@robot');
    const refreshing = f.session.refresh();
    const listing = f.session.listGestures();
    await tick();
    assert.deepEqual(order, ['read:start'], 'listGestures must wait for readDone before dispatching');
    finishRead();
    await refreshing;
    const gestures = await listing;
    assert.equal(gestures.length, 1);
    assert.equal(gestures[0].name, 'nod_yes');
    assert.deepEqual(order, ['read:start', 'read:end', 'listGestures']);
  } finally {
    f.session.dispose();
  }

  // 2. Retries up to 3 times on native busy (150ms, 300ms, 500ms) and succeeds on retry.
  const f2 = fixture();
  let busyAttempts = 0;
  f2.transport.listGestures = async () => {
    busyAttempts++;
    if (busyAttempts <= 2) throw Object.assign(new Error('busy'), { code: 'busy' });
    return [{ name: 'offer_paw', description: '伸爪', durationMs: 4820 }];
  };
  try {
    await f2.session.connect(endpoint, 'doso-g20@robot');
    const gestures = await f2.session.listGestures();
    assert.equal(busyAttempts, 3);
    assert.equal(gestures[0].name, 'offer_paw');
  } finally {
    f2.session.dispose();
  }

  // 3. Throws immediately on unimplemented with zero retries.
  const f3 = fixture();
  let unimplAttempts = 0;
  f3.transport.listGestures = async () => {
    unimplAttempts++;
    throw Object.assign(new Error('unimplemented'), { code: 'unimplemented' });
  };
  try {
    await f3.session.connect(endpoint, 'doso-g20@robot');
    await assert.rejects(f3.session.listGestures(), error => error.code === 'unimplemented');
    assert.equal(unimplAttempts, 1);
  } finally {
    f3.session.dispose();
  }

  // 4. Throws immediately on disconnect during busy retry without waiting or retrying on closed session.
  const f4 = fixture();
  let disconnectAttempts = 0;
  f4.transport.listGestures = async () => {
    disconnectAttempts++;
    throw Object.assign(new Error('busy'), { code: 'busy' });
  };
  try {
    await f4.session.connect(endpoint, 'doso-g20@robot');
    const pending = f4.session.listGestures();
    await tick();
    await f4.session.disconnect();
    await assert.rejects(pending, error => error.code === 'cancelled');
    assert.equal(disconnectAttempts, 1);
  } finally {
    f4.session.dispose();
  }
});
