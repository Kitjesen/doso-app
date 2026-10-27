import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRig, runScenario, SYNTHETIC_WIFI } from './fixture.mjs';
import { bytes, digest, ephemeral, frameMessage, MAX_MESSAGE_BYTES, NetworkError, reassembler, secureChannel, transfer, validateWifi } from './protocol.mjs';

const code = expected => error => error?.code === expected;
const sendCredentials = rig => rig.robot.receive(rig.wire(rig.client.credentials(SYNTHETIC_WIFI.ssid, SYNTHETIC_WIFI.password)));
const rawClient = (session, hello, ack) => secureChannel({ sharedSecret: session.clientKey.secret(ack.serverPublicKey),
  transcript: ['DOSO BLE SIM v1', hello.binding, hello.clientPublicKey, hello.clientNonce, digest(bytes(hello.grant)),
    ack.sessionId, ack.serverPublicKey, ack.serverNonce, ack.proof], sessionId: ack.sessionId, role: 'client' });

for (const attMtu of [23, 185]) test('both peers complete simulated network verification at ATT MTU ' + attMtu + ' without claiming ownership', async () => {
  const result = await runScenario('success', attMtu);
  assert.equal(result.networkOutcome, 'verified-network-awaiting-bind');
  assert.equal(result.domainPhase, 'awaiting_confirmation');
  assert.equal(result.cloudBindingCommitted, false); assert.equal(result.actualBleOrWifiUsed, false);
  assert.equal(result.networkAttempts, 1);
});

test('trusted configuration grant and pinned manufacturing signature are both required', () => {
  const wrongIdentity = createRig({ wrongFactoryKey: true });
  assert.throws(() => wrongIdentity.handshake(), code('signature_invalid'));
  assert.equal(wrongIdentity.network.attempts, 0);
  const rig = createRig(), hello = rig.client.hello(rig.grant);
  assert.throws(() => rig.robot.open({ ...hello, grant: { ...hello.grant, signature: 'invalid' } }), code('signature_invalid'));
  const binding = { ...rig.binding, device_id: 'another-simulated-device' };
  const grant = rig.resignGrant({ ...rig.grant.body, binding });
  assert.throws(() => rig.robot.open({ ...hello, binding, grant }), code('grant_target'));
  assert.throws(() => rig.robot.open({ ...hello, clientPublicKey: ephemeral().publicKey }), code('grant_client'));
  assert.equal(rig.network.attempts, 0);
});

test('revoked epoch, expired authorization and altered account/session binding cannot reach the network adapter', () => {
  const rig = createRig(), hello = rig.client.hello(rig.grant);
  const binding = { ...rig.binding, authorization_epoch: 0 };
  assert.throws(() => rig.robot.open({ ...hello, binding, grant: rig.resignGrant({ ...rig.grant.body, binding }) }), code('grant_target'));
  assert.throws(() => rig.robot.open({ ...hello, binding: { ...rig.binding, terminal_id: 'another-terminal' } }), code('grant_binding'));
  rig.advance(60001); assert.throws(() => rig.robot.open(hello), code('session_expired'));
  assert.equal(rig.network.attempts, 0);
});

test('authenticated encrypted configuration hides credentials and invalidates the flow on the first bad packet', async () => {
  const rig = createRig(); rig.handshake();
  const packet = rig.client.credentials(SYNTHETIC_WIFI.ssid, SYNTHETIC_WIFI.password);
  assert.equal(bytes(packet).includes(Buffer.from(SYNTHETIC_WIFI.password)), false);
  assert.equal(bytes(packet).includes(Buffer.from(SYNTHETIC_WIFI.ssid)), false);
  const mutated = { ...packet, ciphertext: (packet.ciphertext[0] === 'A' ? 'B' : 'A') + packet.ciphertext.slice(1) };
  await assert.rejects(rig.robot.receive(mutated), code('authentication_failed')); assert.equal(rig.network.attempts, 0);
  assert.equal(rig.robot.state.phase, 'invalidated');
  await assert.rejects(rig.robot.receive(rig.wire(packet)), code('inactive_session'));
  const fresh = createRig(); fresh.handshake(); const valid = fresh.client.credentials(SYNTHETIC_WIFI.ssid, SYNTHETIC_WIFI.password);
  const report = await fresh.robot.receive(fresh.wire(valid)); fresh.client.acceptReport(fresh.wire(report));
  await assert.rejects(fresh.robot.receive(fresh.wire(valid)), code('sequence_or_session'));
  assert.throws(() => fresh.client.credentials(SYNTHETIC_WIFI.ssid, SYNTHETIC_WIFI.password));
  assert.equal(fresh.network.attempts, 1); assert.equal(fresh.network.candidateConnected, false);
});

test('keys, nonces and AAD separate both directions, target/session and ordered records', () => {
  const secret = Buffer.alloc(32, 7), transcript = ['target-A', 'request-A'];
  const client = secureChannel({ sharedSecret: secret, transcript, sessionId: 'test-session', role: 'client' });
  const robot = secureChannel({ sharedSecret: secret, transcript, sessionId: 'test-session', role: 'robot' });
  const other = secureChannel({ sharedSecret: secret, transcript: ['target-B', 'request-A'], sessionId: 'test-session', role: 'robot' });
  const forward = client.seal({ value: 'synthetic' }), reverse = robot.seal({ value: 'synthetic' });
  assert.notEqual(forward.ciphertext, reverse.ciphertext);
  assert.throws(() => other.open(forward), code('authentication_failed'));
  assert.deepEqual(robot.open(forward), { value: 'synthetic' });
  assert.deepEqual(client.open(reverse), { value: 'synthetic' });
  const next = client.seal({ value: 2 }), third = client.seal({ value: 3 });
  assert.throws(() => robot.open(third), code('sequence_or_session'));
  assert.throws(() => robot.open(next), code('inactive_session'));
  const reflected = secureChannel({ sharedSecret: secret, transcript, sessionId: 'test-session', role: 'client' });
  assert.throws(() => reflected.open(forward), code('authentication_failed'));
  client.destroy(); assert.throws(() => client.seal({ value: 4 }), code('inactive_session'));
});

test('GCM requires canonical 16-byte tags and the first truncated, oversized or noncanonical tag closes the channel', async () => {
  const mutations = [4, 8, 12, 17, 'padding', 'noncanonical'];
  for (const mutation of mutations) {
    const rig = createRig(); rig.handshake();
    const packet = rig.client.credentials(SYNTHETIC_WIFI.ssid, SYNTHETIC_WIFI.password), original = Buffer.from(packet.tag, 'base64url');
    let tag;
    if (typeof mutation === 'number') tag = (mutation < 16 ? original.subarray(0, mutation) : Buffer.concat([original, Buffer.alloc(1)])).toString('base64url');
    else if (mutation === 'padding') tag = packet.tag + '==';
    else { const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'; tag = packet.tag.slice(0, -1) + alphabet[alphabet.indexOf(packet.tag.at(-1)) + 1]; }
    await assert.rejects(rig.robot.receive({ ...packet, tag }), code('ciphertext_invalid'));
    assert.equal(rig.robot.state.phase, 'invalidated'); assert.equal(rig.network.attempts, 0);
    await assert.rejects(rig.robot.receive(packet), code('inactive_session'));
  }
});

test('a bad encrypted packet invalidates an in-flight attempt and its late result cannot leave a candidate', async () => {
  const rig = createRig({ deferNetwork: true }), { hello, ack } = rig.handshake(), sender = rawClient(rig, hello, ack);
  const pending = rig.robot.receive(rig.wire(sender.seal({ kind: 'wifi-config', binding: rig.binding,
    ssid: SYNTHETIC_WIFI.ssid, password: SYNTHETIC_WIFI.password })));
  const bad = sender.seal({ kind: 'cancel', binding: rig.binding });
  bad.tag = Buffer.from(bad.tag, 'base64url').subarray(0, 4).toString('base64url');
  await assert.rejects(rig.robot.receive(rig.wire(bad)), code('ciphertext_invalid'));
  assert.equal(rig.robot.state.phase, 'invalidated'); rig.network.finishLate(1);
  assert.equal(await pending, null); assert.equal(rig.network.candidateConnected, false);
  assert.equal(rig.network.current, 'EXISTING-SYNTHETIC');
});

for (const attMtu of [23, 185]) test('bounded fragments fit the negotiated ATT payload at MTU ' + attMtu, () => {
  const value = { blob: 'x'.repeat(4085) }; assert.equal(bytes(value).length, MAX_MESSAGE_BYTES);
  const frames = frameMessage(value, attMtu);
  assert.ok(frames.every(frame => frame.length <= attMtu - 3));
  assert.deepEqual(transfer(value, { attMtu, now: () => 100 }), value);
  assert.throws(() => frameMessage({ blob: 'x'.repeat(4086) }, attMtu), code('message_length'));
});

test('fragment duplicate, reordering, mixed sizes, expiry and clear discard partial data', () => {
  let clock = 0; const frames = frameMessage({ blob: 'x'.repeat(40) }, 23);
  const fresh = () => reassembler({ attMtu: 23, now: () => clock });
  const duplicate = fresh(); duplicate.push(frames[0]); assert.throws(() => duplicate.push(frames[0]), code('frame_order'));
  const order = fresh(); assert.throws(() => order.push(frames[1]), code('frame_order'));
  const mixed = fresh(); mixed.push(frames[0]);
  const altered = Buffer.from(frames[1]); altered.writeUInt16BE(4097, 5);
  assert.throws(() => mixed.push(altered), code('frame_length'));
  const expired = fresh(); expired.push(frames[0]); clock = 3001;
  assert.throws(() => expired.push(frames[1]), code('frame_expired_or_mixed'));
  const cleared = fresh(); cleared.push(frames[0]); cleared.clear(); assert.throws(() => cleared.push(frames[1]), code('frame_order'));
  assert.throws(() => frameMessage({}, 22), code('mtu_invalid'));
  assert.throws(() => frameMessage({}, 248), code('mtu_invalid'));
});

test('SSID uses UTF8 byte bounds and WPA2 personal passphrase rules without trimming', () => {
  assert.doesNotThrow(() => validateWifi('😀'.repeat(8), ' test 123 '));
  assert.doesNotThrow(() => validateWifi('x'.repeat(32), 'a'.repeat(64)));
  for (const ssid of ['', '😀'.repeat(9), 'x'.repeat(33), 'bad\0name', '\ud800']) assert.throws(() => validateWifi(ssid, SYNTHETIC_WIFI.password), code('ssid_invalid'));
  for (const password of ['short', 'z'.repeat(64), '密码12345678', 'long\npassword']) assert.throws(() => validateWifi('synthetic', password), code('password_invalid'));
});

test('wrong password and timeout preserve the prior network and never report configured', async () => {
  for (const scenario of ['wrong-password', 'timeout']) {
    const result = await runScenario(scenario); assert.equal(result.oldNetworkPreserved, true);
    assert.equal(result.events.includes('network-configuration-committed'), false);
  }
});

test('cancel while connect is in flight ignores a late success and prevents subsequent reports', async () => {
  const rig = createRig({ deferNetwork: true }); rig.handshake();
  const pending = sendCredentials(rig);
  await rig.robot.receive(rig.wire(rig.client.cancel())); rig.network.finishLate();
  assert.equal(await pending, null); assert.equal(rig.network.current, 'EXISTING-SYNTHETIC');
  assert.equal(rig.robot.state.phase, 'cancelled'); assert.equal(rig.client.state.phase, 'cancelled');
  assert.throws(() => rig.client.acceptReport({}), code('inactive_session'));
});

test('session expiry during connect rolls back candidate and a used grant cannot reopen the service', async () => {
  const rig = createRig({ deferNetwork: true }), { hello } = rig.handshake();
  const pending = sendCredentials(rig); rig.advance(60001); rig.network.finishLate();
  assert.equal(await pending, null); assert.equal(rig.network.current, 'EXISTING-SYNTHETIC');
  assert.equal(rig.robot.state.phase, 'expired');
  const other = createRig(), opened = other.handshake(); other.robot.expire();
  assert.throws(() => other.robot.open(opened.hello), code('grant_replayed'));
  assert.equal(hello.binding.device_id, rig.binding.device_id);
});

test('cancel after a device report was prepared still rejects that late report and rolls back the candidate', async () => {
  const rig = createRig(); rig.handshake(); const prepared = await sendCredentials(rig);
  await rig.robot.receive(rig.wire(rig.client.cancel()));
  assert.throws(() => rig.client.acceptReport(rig.wire(prepared)), code('inactive_session'));
  assert.equal(rig.network.current, 'EXISTING-SYNTHETIC'); assert.equal(rig.network.candidateConnected, false);
});

test('an old session late success or unexpected rejection cannot set or roll back a new session candidate', async () => {
  for (const rejects of [false, true]) {
    const rig = createRig({ deferNetwork: true }); rig.handshake();
    const pendingA = sendCredentials(rig).then(value => ({ value }), error => ({ error }));
    await rig.robot.receive(rig.wire(rig.client.cancel()));
    const sessionB = rig.newSession(); sessionB.handshake();
    const pendingB = rig.robot.receive(rig.wire(sessionB.client.credentials('B-SYNTHETIC', SYNTHETIC_WIFI.password)));
    rig.network.finishLate(2); sessionB.client.acceptReport(rig.wire(await pendingB));
    assert.equal(rig.network.candidateConnected, true);
    const failure = rejects ? new TypeError('synthetic invariant') : null;
    rig.network.finishLate(1, failure); const old = await pendingA;
    if (rejects) assert.equal(old.error === failure, true); else assert.equal(old.value, null);
    assert.equal(rig.network.candidateConnected, true); assert.equal(rig.robot.state.phase, 'awaiting_confirmation');
    const proof = rig.robot.ipProbe(sessionB.client.probe());
    const ack = await rig.robot.receive(rig.wire(sessionB.client.confirmNetwork(proof))); sessionB.client.acceptCommit(rig.wire(ack));
    assert.equal(rig.network.current === 'B-SYNTHETIC', true);
  }
});

test('unexpected network exceptions propagate after scoped cleanup instead of becoming a device rejection report', async () => {
  for (const stage of ['connect', 'report-input']) {
    const rig = createRig(); rig.handshake();
    const failure = new TypeError('synthetic invariant'); failure.code = 'network_timeout';
    const connect = rig.network.connect;
    rig.network.connect = async (...args) => {
      const result = await connect(...args);
      if (stage === 'connect') throw failure;
      return { connected: result.connected, get ip() { throw failure; } };
    };
    await assert.rejects(sendCredentials(rig), error => error === failure);
    assert.equal(rig.robot.state.failure, null); assert.equal(rig.robot.state.phase, 'connecting');
    assert.equal(rig.network.candidateConnected, false); assert.equal(rig.network.current, 'EXISTING-SYNTHETIC');
  }
  const expected = createRig(); expected.handshake();
  expected.network.connect = async () => { throw new NetworkError('network_unavailable'); };
  expected.client.acceptReport(expected.wire(await sendCredentials(expected)));
  assert.equal(expected.client.state.failure.code, 'device_rejected');
});

test('a new encrypted session cannot commit using a genuine signed IP proof from the previous session', async () => {
  const rig = createRig(); rig.handshake(); rig.client.acceptReport(rig.wire(await sendCredentials(rig)));
  const staleProof = rig.robot.ipProbe(rig.client.probe());
  await rig.robot.receive(rig.wire(rig.client.cancel()));
  const sessionB = rig.newSession(), { hello, ack } = sessionB.handshake(), attacker = rawClient(sessionB, hello, ack);
  const report = await rig.robot.receive(rig.wire(attacker.seal({ kind: 'wifi-config', binding: sessionB.binding,
    ssid: SYNTHETIC_WIFI.ssid, password: SYNTHETIC_WIFI.password }))); attacker.open(rig.wire(report));
  await assert.rejects(rig.robot.receive(rig.wire(attacker.seal({ kind: 'commit-network', binding: sessionB.binding, proof: staleProof }))), code('commit_order'));
  const freshProof = rig.robot.ipProbe('new-session-challenge');
  await assert.rejects(rig.robot.receive(rig.wire(attacker.seal({ kind: 'commit-network', binding: sessionB.binding, proof: staleProof }))), code('ip_identity_mismatch'));
  assert.equal(rig.network.current, 'EXISTING-SYNTHETIC');
  await rig.robot.receive(rig.wire(attacker.seal({ kind: 'commit-network', binding: sessionB.binding, proof: freshProof })));
  assert.equal(rig.robot.networkCommitted, true);
});

test('commit is irreversible within the session and later cancel or expiry cannot claim a rollback', async () => {
  const rig = createRig(); rig.handshake(); rig.client.acceptReport(rig.wire(await sendCredentials(rig)));
  const proof = rig.robot.ipProbe(rig.client.probe()), commit = rig.client.confirmNetwork(proof);
  assert.throws(() => rig.client.cancel(), code('commit_pending'));
  const ack = await rig.robot.receive(rig.wire(commit)); rig.client.acceptCommit(rig.wire(ack));
  assert.throws(() => rig.client.cancel(), code('already_committed')); assert.throws(() => rig.client.expire(), code('already_committed'));
  await assert.rejects(rig.robot.receive({}), code('already_committed')); assert.throws(() => rig.robot.expire(), code('already_committed'));
  assert.equal(rig.client.state.phase, 'awaiting_confirmation'); assert.equal(rig.robot.state.phase, 'awaiting_confirmation');
  assert.equal(rig.network.current === 'EXISTING-SYNTHETIC', false);
  const direct = createRig(), opened = direct.handshake(), sender = rawClient(direct, opened.hello, opened.ack);
  const report = await direct.robot.receive(sender.seal({ kind: 'wifi-config', binding: direct.binding,
    ssid: SYNTHETIC_WIFI.ssid, password: SYNTHETIC_WIFI.password })); sender.open(report);
  const directProof = direct.robot.ipProbe('direct-client-challenge');
  sender.open(await direct.robot.receive(sender.seal({ kind: 'commit-network', binding: direct.binding, proof: directProof })));
  await assert.rejects(direct.robot.receive(sender.seal({ kind: 'cancel', binding: direct.binding })), code('already_committed'));
  assert.equal(direct.robot.state.phase, 'awaiting_confirmation'); assert.equal(direct.robot.networkCommitted, true);
});

test('IP side proof is necessary before persistence and binds the current nonce/device/session', async () => {
  const rig = createRig(); rig.handshake(); rig.client.acceptReport(rig.wire(await sendCredentials(rig)));
  assert.equal(rig.network.current, 'EXISTING-SYNTHETIC');
  rig.client.probe(); const wrong = rig.robot.ipProbe('wrong-synthetic-challenge');
  assert.throws(() => rig.client.confirmNetwork(wrong), code('ip_identity_mismatch'));
  const proof = rig.robot.ipProbe(rig.client.probe());
  const ack = await rig.robot.receive(rig.wire(rig.client.confirmNetwork(proof)));
  assert.deepEqual(rig.client.acceptCommit(rig.wire(ack)), { network: 'verified-network', domainPhase: 'awaiting_confirmation', cloudBindingCommitted: false });
  assert.equal(rig.network.current === 'EXISTING-SYNTHETIC', false);
});

test('CLI accepts only fixed synthetic scenarios and public results contain no credentials', async () => {
  const output = JSON.stringify(await runScenario('success'));
  assert.equal(output.includes(SYNTHETIC_WIFI.password), false); assert.equal(output.includes(SYNTHETIC_WIFI.ssid), false);
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./run.mjs', import.meta.url)), '--ssid', 'not-used'], { encoding: 'utf8' });
  assert.equal(result.status, 2); assert.equal(result.stdout, ''); assert.equal(result.stderr.includes('not-used'), false);
});
