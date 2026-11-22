import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { createLocalBrainstemSimServer } from '../src/localBrainstemSimServer.js';
import { createDevLanBridge } from '../src/devLanBridge.js';

async function postJson(origin, path, body, headers = {}) {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'http://localhost:8081',
      ...headers,
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test('devLanBridge refuses non-loopback bind and rejects disallowed Origin or non-RFC1918 targets', async () => {
  await assert.rejects(createDevLanBridge({ listenHost: '0.0.0.0', listenPort: 0 }), /loopback/u);
  const bridge = await createDevLanBridge({ listenPort: 0 });
  try {
    const disallowedOrigin = await fetch(`${bridge.origin}/api/v1/dev-lan/health`, {
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(disallowedOrigin.status, 403);
    assert.equal((await disallowedOrigin.json()).code, 'unauthorized');

    for (const host of ['8.8.8.8', 'robot.local', '::1', '127.0.0.2', '192.168.001.1']) {
      const res = await postJson(bridge.origin, '/api/v1/dev-lan/read', {
        host, port: 13145, requestId: 'bad-target', kind: 'status',
      });
      assert.equal(res.status, 400);
      assert.equal(res.body.ok, false);
      assert.equal(res.body.code, 'config');
    }

    const badPort = await postJson(bridge.origin, '/api/v1/dev-lan/read', {
      host: '127.0.0.1', port: 0, requestId: 'bad-port', kind: 'status',
    });
    assert.equal(badPort.status, 400);
    assert.equal(badPort.body.code, 'config');
  } finally {
    await bridge.close();
  }
});

test('devLanBridge drives full read, control, 50Hz walk, concurrent telemetry, IMU stream, recovery and safe stop against local simulation', async () => {
  const sim = await createLocalBrainstemSimServer({
    port: 0,
    transitionDurationMs: 0,
    leaseDurationMs: 300,
    imuIntervalMs: 30,
  });
  const bridge = await createDevLanBridge({ listenPort: 0 });
  try {
    const health = await fetch(`${bridge.origin}/api/v1/dev-lan/health`, {
      headers: { Origin: 'http://localhost:8081' },
    });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), 'http://localhost:8081');

    // 1. All 4 read-only endpoints in lan-dev mode
    const statusRead = await postJson(bridge.origin, '/api/v1/dev-lan/read', {
      host: sim.host, port: sim.port, requestId: 'r-status-1', kind: 'status',
    });
    assert.equal(statusRead.status, 200);
    assert.equal(statusRead.body.data.transport, 'grpc-lan');
    assert.equal(statusRead.body.data.mutualTlsVerified, false);
    assert.equal(statusRead.body.data.clientIdentitySelected, false);
    assert.equal(statusRead.body.data.status.fsmKind, 'grounded');
    assert.equal(statusRead.body.data.status.motorOutputEnabled, false);

    const profileRead = await postJson(bridge.origin, '/api/v1/dev-lan/read', {
      host: sim.host, port: sim.port, requestId: 'r-profile-1', kind: 'profile',
    });
    assert.equal(profileRead.body.data.profile.current, 'mini-flat');
    assert.equal(profileRead.body.data.profile.activeModeId, 'flat');

    const voltageRead = await postJson(bridge.origin, '/api/v1/dev-lan/read', {
      host: sim.host, port: sim.port, requestId: 'r-voltage-1', kind: 'voltage',
    });
    assert.equal(voltageRead.body.data.voltage.values.length, 16);
    assert.ok(voltageRead.body.data.voltage.values.every((v) => v > 24 && v < 26));

    const motorsRead = await postJson(bridge.origin, '/api/v1/dev-lan/read', {
      host: sim.host, port: sim.port, requestId: 'r-motors-1', kind: 'motors',
    });
    assert.equal(motorsRead.body.data.motors.length, 16);
    assert.ok(motorsRead.body.data.motors.every((m) => m.online === true));

    // 2. Open control session
    const opened = await postJson(bridge.origin, '/api/v1/dev-lan/session/open', {
      host: sim.host, port: sim.port, requestId: 'c-open-1',
    });
    assert.equal(opened.status, 200);
    const { sessionId, sessionPrincipal } = opened.body.data;
    assert.match(sessionPrincipal, /^lan-[0-9a-f]{32}@dev$/);
    assert.equal(opened.body.data.leaseActive, false);
    assert.equal(opened.body.data.mutualTlsVerified, false);

    // Same-peer read works while session is open; different-peer read fails with busy.
    const samePeerVoltage = await postJson(bridge.origin, '/api/v1/dev-lan/read', {
      host: sim.host, port: sim.port, requestId: 'r-same-peer', kind: 'voltage',
    });
    assert.equal(samePeerVoltage.status, 200);
    const otherPeerStatus = await postJson(bridge.origin, '/api/v1/dev-lan/read', {
      host: '192.168.66.64', port: 13145, requestId: 'r-other-peer', kind: 'status',
    });
    assert.equal(otherPeerStatus.status, 409);
    assert.equal(otherPeerStatus.body.code, 'busy');

    // 3. Recovery status and IMU SSE stream
    const rec = await postJson(bridge.origin, '/api/v1/dev-lan/session/recovery', {
      sessionId, command: 'status',
    });
    assert.equal(rec.status, 200);
    assert.equal(rec.body.data.phase, 'absent');
    assert.equal(rec.body.data.reason, 'model-not-configured');

    const imuAbort = new AbortController();
    const imuResponse = await fetch(`${bridge.origin}/api/v1/dev-lan/session/${sessionId}/imu`, {
      headers: { Origin: 'http://localhost:8081', Accept: 'text/event-stream' },
      signal: imuAbort.signal,
    });
    assert.equal(imuResponse.status, 200);
    const reader = imuResponse.body.getReader();
    const decoder = new TextDecoder();
    let sseBuffer = '';
    let imuSample = null;
    while (!imuSample) {
      const { value, done } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });
      const match = /data:\s*(\{[^\n]+\})/.exec(sseBuffer);
      if (match) imuSample = JSON.parse(match[1]);
    }
    assert.ok(imuSample && Number.isFinite(imuSample.quatW) && Number.isFinite(imuSample.accelZ));
    imuAbort.abort();

    // 4. Enable -> StandUp -> SwitchProfile -> Acquire -> WalkChecked(1.0) -> Interrupt -> SitDown -> Disable
    const enabled = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'enable' });
    assert.equal(enabled.body.data.status.motorOutputEnabled, true);

    const stood = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'stand-up' });
    assert.equal(stood.body.data.status.fsmKind, 'standing');

    const switched = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', {
      sessionId, action: 'switch-profile', profileName: 'stairs',
    });
    assert.equal(switched.body.data.profile.current, 'mini-stairs');
    assert.equal(switched.body.data.profile.activeModeId, 'stairs');

    const acquired = await postJson(bridge.origin, '/api/v1/dev-lan/session/acquire', { sessionId });
    assert.equal(acquired.body.data.leaseActive, true);
    assert.equal(acquired.body.data.leaseOwnerMatched, true);
    assert.equal(acquired.body.data.principalVerified, false);
    assert.equal(acquired.body.data.sequence, 1);

    const walked = await postJson(bridge.origin, '/api/v1/dev-lan/session/input', {
      sessionId, forward: 1.0, lateral: -0.25, yaw: -0.5,
    });
    assert.equal(walked.body.data.leaseActive, true);
    assert.equal(walked.body.data.sequence, 2);
    assert.equal(walked.body.data.status.fsmKind, 'walking');
    assert.deepEqual(sim.snapshot().velocity, { x: 1.0, y: -0.25, z: -0.5 });

    const interrupted = await postJson(bridge.origin, '/api/v1/dev-lan/session/interrupt', { sessionId });
    assert.equal(interrupted.body.data.leaseActive, false);
    assert.equal(interrupted.body.data.status.fsmKind, 'standing');
    assert.equal(interrupted.body.data.status.grpcLeaseActive, false);

    const sat = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'sit-down' });
    assert.equal(sat.body.data.status.fsmKind, 'grounded');

    const disabled = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'disable' });
    assert.equal(disabled.body.data.status.motorOutputEnabled, false);

    // 5. Gestures, zero calibration and fault clearing
    const gestureList = await postJson(bridge.origin, '/api/v1/dev-lan/session/gestures', { sessionId });
    assert.equal(gestureList.status, 200);
    assert.equal(gestureList.body.data.gestures.length, 35);
    assert.equal(gestureList.body.data.gestures.some((item) => item.name === 'stand_up' || item.name === 'wake_stand'), false);
    assert.ok(gestureList.body.data.gestures.some((item) => item.name === 'play_bow' && item.description === '玩耍鞠躬' && item.durationMs > 0));
    assert.ok(gestureList.body.data.gestures.some((item) => item.name === 'flip_play_bow' && item.durationMs >= 16000));
    assert.ok(gestureList.body.data.gestures.some((item) => item.name === 'nod_yes' && item.description === '点头同意' && item.durationMs > 0));

    const zeroed = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'set-zero' });
    assert.equal(zeroed.status, 200);
    assert.equal(zeroed.body.data.status.fsmKind, 'grounded');

    const gestureGrounded = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'play-gesture', gestureName: 'play_bow' });
    assert.equal(gestureGrounded.status, 409, 'gestures require Standing');

    const cleared = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'clear-motor-fault', jointIds: [] });
    assert.equal(cleared.status, 200);
    const badClear = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'clear-motor-fault', jointIds: [16] });
    assert.equal(badClear.status, 400);

    await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'enable' });
    const gestureGroundedEnabled = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', {
      sessionId, action: 'play-gesture', gestureName: 'nod_yes',
    });
    assert.equal(gestureGroundedEnabled.status, 409, 'gestures disallow Grounded even when motors are enabled');
    assert.equal(gestureGroundedEnabled.body.code, 'precondition');
    await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'stand-up' });
    const zeroStanding = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'set-zero' });
    assert.equal(zeroStanding.status, 409, 'zero calibration requires Grounded');
    const gestured = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'play-gesture', gestureName: 'nod_yes' });
    assert.equal(gestured.status, 200);
    assert.equal(gestured.body.data.status.fsmKind, 'standing', 'zero-duration simulation returns to Standing');
    const unknownGesture = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'play-gesture', gestureName: 'moonwalk' });
    assert.equal(unknownGesture.body.code, 'precondition');
    await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'sit-down' });
    await postJson(bridge.origin, '/api/v1/dev-lan/session/action', { sessionId, action: 'disable' });

    const closed = await postJson(bridge.origin, '/api/v1/dev-lan/session/close', { sessionId });
    assert.equal(closed.status, 200);
  } finally {
    await bridge.close();
    await sim.close();
  }
});

test('devLanBridge handles Chrome Private Network Access OPTIONS preflight and sim serves HTTP state', async () => {
  const sim = await createLocalBrainstemSimServer({
    port: 0,
    statePort: 0,
    transitionDurationMs: 0,
    leaseDurationMs: 300,
    imuIntervalMs: 30,
  });
  const bridge = await createDevLanBridge({ listenPort: 0 });
  try {
    const preflight = await fetch(`${bridge.origin}/api/v1/dev-lan/session/open`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'http://localhost:8081',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type, accept',
        'Access-Control-Request-Private-Network': 'true',
      },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:8081');
    assert.equal(preflight.headers.get('access-control-allow-private-network'), 'true');

    assert.ok(Number.isInteger(sim.statePort) && sim.statePort > 0);
    const simStateRes = await fetch(`http://127.0.0.1:${sim.statePort}/api/v1/sim/state`);
    assert.equal(simStateRes.status, 200);
    const simState = await simStateRes.json();
    assert.equal(simState.ok, true);
    assert.equal(simState.simulation, true);
    assert.equal(simState.motors.length, 16);
    assert.equal(simState.profile.current, 'mini-flat');
  } finally {
    await bridge.close();
    await sim.close();
  }
});

test('devLanBridge drives opt-in platform profile switch and RobotRecovery workflow through sim state', async () => {
  const sim = await createLocalBrainstemSimServer({
    port: 0,
    statePort: 0,
    transitionDurationMs: 0,
    leaseDurationMs: 300,
    imuIntervalMs: 30,
    platformConfigured: true,
    recoveryConfigured: true,
    recoveryDurationMs: 40,
  });
  const bridge = await createDevLanBridge({ listenPort: 0 });
  try {
    const opened = await postJson(bridge.origin, '/api/v1/dev-lan/session/open', {
      host: sim.host, port: sim.port, requestId: 'r-open-rec',
    });
    assert.equal(opened.status, 200);
    const { sessionId } = opened.body.data;
    assert.equal(opened.body.data.profile.activeModeId, 'flat');

    const switched = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', {
      sessionId, action: 'switch-profile', profileName: 'platform',
    });
    assert.equal(switched.status, 200);
    assert.equal(switched.body.data.profile.current, 'mini-platform');
    assert.equal(switched.body.data.profile.activeModeId, 'platform');

    const entered = await postJson(bridge.origin, '/api/v1/dev-lan/session/recovery', { sessionId, command: 'enter' });
    assert.equal(entered.status, 200);
    assert.equal(entered.body.data.phase, 'selected');
    assert.equal(entered.body.data.modelConfigured, true);

    const enabled = await postJson(bridge.origin, '/api/v1/dev-lan/session/recovery', { sessionId, command: 'enable' });
    assert.equal(enabled.body.data.phase, 'enabled');

    const started = await postJson(bridge.origin, '/api/v1/dev-lan/session/recovery', { sessionId, command: 'start' });
    assert.equal(started.body.data.phase, 'getting-up');

    const midState = await (await fetch(`http://127.0.0.1:${sim.statePort}/api/v1/sim/state`)).json();
    assert.equal(midState.recovery.phase, 4);

    await sleep(80);
    const stable = await postJson(bridge.origin, '/api/v1/dev-lan/session/recovery', { sessionId, command: 'status' });
    assert.equal(stable.body.data.phase, 'stable-stand');
    assert.equal(stable.body.data.stableStand, true);

    const exited = await postJson(bridge.origin, '/api/v1/dev-lan/session/recovery', { sessionId, command: 'exit' });
    assert.equal(exited.body.data.phase, 'absent');
    assert.equal(exited.body.data.activeModeId, 'platform');
  } finally {
    await bridge.close();
    await sim.close();
  }
});

test('devLanBridge projects kind=3 body-height capability from real-robot GetProfile layout and degrades unknown kinds', async () => {
  const sim = await createLocalBrainstemSimServer({
    port: 0,
    transitionDurationMs: 0,
    heightConfigured: true,
    recoveryConfigured: true,
    extraModeCapabilities: [
      { id: 'future_mode', kind: 9, availability: 1, profileId: '', unavailableReason: 'reserved' },
    ],
  });
  const bridge = await createDevLanBridge({ listenPort: 0 });
  try {
    const profileRead = await postJson(bridge.origin, '/api/v1/dev-lan/read', {
      host: sim.host, port: sim.port, requestId: 'r-profile-height', kind: 'profile',
    });
    assert.equal(profileRead.status, 200);
    const caps = profileRead.body.data.profile.modeCapabilities;
    const heightCap = caps.find((item) => item.id === 'height');
    assert.deepEqual(heightCap, {
      id: 'height',
      kind: 'body-height',
      availability: 'available',
      label: '身高控制',
      profileId: 'single_frame_height_v2',
      available: true,
      unavailableReason: '',
    });
    const futureCap = caps.find((item) => item.id === 'future_mode');
    assert.equal(futureCap?.kind, 'unspecified');

    const opened = await postJson(bridge.origin, '/api/v1/dev-lan/session/open', {
      host: sim.host, port: sim.port, requestId: 'r-open-height',
    });
    assert.equal(opened.status, 200);
    const { sessionId } = opened.body.data;
    assert.equal(opened.body.data.profile.modeCapabilities.find((item) => item.id === 'height')?.kind, 'body-height');

    const rejectSwitchHeight = await postJson(bridge.origin, '/api/v1/dev-lan/session/action', {
      sessionId, action: 'switch-profile', profileName: 'height',
    });
    assert.equal(rejectSwitchHeight.status, 409);
    assert.equal(rejectSwitchHeight.body.code, 'precondition');
  } finally {
    await bridge.close();
    await sim.close();
  }
});
