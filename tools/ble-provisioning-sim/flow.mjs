import { createInitialProvisioningState, reduceProvisioning } from '../../src/domain/device-provisioning/index.ts';
import { bytes, digest, ephemeral, NetworkError, nonce, requireThat, secureChannel, signed, validateWifi, verified } from './protocol.mjs';

const terminal = state => ['cancelled', 'expired', 'invalidated', 'failed', 'succeeded'].includes(state.phase);
const proofFor = (binding, time) => ({ provisioning_id: binding.provisioning_id, challenge_id: binding.challenge_id,
  nonce_b64url: binding.nonce_b64url, device_id: binding.device_id, auth_session_id: binding.auth_session_id,
  authorization_epoch: binding.authorization_epoch, factory_reset_counter: binding.factory_reset_counter, proved_at_ms: time });
const transcriptFor = (hello, ack) => ['DOSO BLE SIM v1', hello.binding, hello.clientPublicKey, hello.clientNonce,
  digest(bytes(hello.grant)), ack.sessionId, ack.serverPublicKey, ack.serverNonce, ack.proof];
const same = (a, b) => digest(bytes(a)) === digest(bytes(b));
function live(state, now) {
  requireThat(state && !terminal(state), 'inactive_session');
  requireThat(now() >= state.issued_at_ms && now() <= state.expires_at_ms, 'session_expired');
}
function authenticateGrant(hello, authorityKey, expectedDeviceId, epoch, resetCounter, now) {
  const grant = verified(hello.grant, authorityKey);
  requireThat(grant.version === 1 && grant.purpose === 'wifi-config' && same(grant.binding, hello.binding), 'grant_binding');
  requireThat(grant.binding.device_id === expectedDeviceId && grant.binding.authorization_epoch === epoch
    && grant.binding.factory_reset_counter === resetCounter, 'grant_target');
  requireThat(grant.clientKeySha256 === digest(Buffer.from(hello.clientPublicKey, 'base64url')), 'grant_client');
  const state = createInitialProvisioningState(grant.binding); live(state, now); return state;
}

export function createAppClient({ binding, clientKey = ephemeral(), now, factoryPublicKey, authorityPublicKey }) {
  let state = createInitialProvisioningState(binding), hello, channel, lastIp, probeNonce, networkVerified = false, commitPending = false, networkCommitted = false;
  const mutable = () => { requireThat(!networkCommitted, 'already_committed'); requireThat(!commitPending, 'commit_pending'); live(state, now); };
  const openPacket = packet => {
    try { return channel.open(packet); }
    catch (error) { if (!terminal(state)) state = reduceProvisioning(state, { type: 'invalidate' }).state; channel.destroy(); throw error; }
  };
  const api = {
    publicKey: clientKey.publicKey,
    get state() { return { ...state }; },
    get networkCommitted() { return networkCommitted; },
    hello(grant) {
      live(state, now); requireThat(!hello, 'hello_replayed');
      const value = { version: 1, kind: 'hello', binding, clientPublicKey: clientKey.publicKey, clientNonce: nonce(), grant };
      authenticateGrant(value, authorityPublicKey, binding.device_id, binding.authorization_epoch, binding.factory_reset_counter, now);
      hello = value; return value;
    },
    acceptHello(ack) {
      live(state, now); requireThat(hello && !channel && ack?.version === 1 && ack.kind === 'hello-ack', 'hello_order');
      const transcript = transcriptFor(hello, ack);
      verified({ body: transcript, signature: ack.signature }, factoryPublicKey);
      state = reduceProvisioning(state, { type: 'device_authenticated', proof: ack.proof, signature_verified: true }).state;
      channel = secureChannel({ sharedSecret: clientKey.secret(ack.serverPublicKey), transcript, sessionId: ack.sessionId, role: 'client' });
    },
    credentials(ssid, password) {
      mutable(); requireThat(channel, 'channel_missing'); validateWifi(ssid, password);
      const next = reduceProvisioning(state, { type: 'credentials_authenticated', authenticated: true,
        account_id: binding.owner_account_id, terminal_id: binding.terminal_id, session_id: binding.auth_session_id });
      const packet = channel.seal({ kind: 'wifi-config', binding, ssid, password }); state = next.state; return packet;
    },
    acceptReport(packet) {
      mutable(); requireThat(channel, 'channel_missing');
      const payload = verified(openPacket(packet), factoryPublicKey);
      requireThat(payload.kind === 'network-report', 'report_invalid');
      const next = reduceProvisioning(state, { type: 'device_report', report: payload.report, signature_verified: true });
      if (payload.report.event_type === 'network_connected') {
        requireThat(typeof payload.ip === 'string' && /^192\.0\.2\.[1-9][0-9]?$/.test(payload.ip), 'simulated_ip_invalid');
        lastIp = payload.ip;
      }
      state = next.state; if (terminal(state)) channel.destroy(); return state.phase;
    },
    probe() { mutable(); requireThat(state.phase === 'awaiting_confirmation', 'probe_order'); probeNonce = nonce(); return probeNonce; },
    confirmNetwork(proof) {
      mutable(); requireThat(channel && state.phase === 'awaiting_confirmation' && probeNonce, 'probe_order');
      const body = verified(proof, factoryPublicKey);
      requireThat(body.kind === 'ip-identity' && body.deviceId === binding.device_id && body.provisioningId === binding.provisioning_id
        && body.nonce === probeNonce && body.ip === lastIp && body.expiresAt === binding.expires_at_ms, 'ip_identity_mismatch');
      const packet = channel.seal({ kind: 'commit-network', binding, proof });
      probeNonce = null; networkVerified = true; commitPending = true; return packet;
    },
    acceptCommit(packet) {
      requireThat(!networkCommitted, 'already_committed'); live(state, now); const body = openPacket(packet);
      requireThat(commitPending && networkVerified && body.kind === 'network-committed' && body.provisioningId === binding.provisioning_id, 'commit_invalid');
      networkCommitted = true; commitPending = false; channel.destroy();
      return { network: 'verified-network', domainPhase: state.phase, cloudBindingCommitted: false };
    },
    cancel() {
      mutable(); requireThat(channel, 'channel_missing');
      const packet = channel.seal({ kind: 'cancel', binding }); state = reduceProvisioning(state, { type: 'cancel' }).state; channel.destroy(); return packet;
    },
    expire() { requireThat(!networkCommitted, 'already_committed'); requireThat(!commitPending, 'commit_pending'); if (!terminal(state)) state = reduceProvisioning(state, { type: 'expire' }).state; channel?.destroy(); },
  };
  return api;
}

export function createRobotService({ deviceId, authorizationEpoch, resetCounter, now, authorityPublicKey, devicePrivateKey,
  devicePublicKey, network, usedRequests = new Set() }) {
  let state, channel, generation = 0, lastIp, lastProbe, currentAttempt, networkCommitted = false;
  const stop = type => {
    requireThat(!networkCommitted, 'already_committed'); generation++;
    if (state && !terminal(state)) state = reduceProvisioning(state, { type }).state;
    if (currentAttempt) network.rollback(currentAttempt); currentAttempt = null; channel?.destroy();
  };
  const active = () => { try { live(state, now); } catch (error) { if (error.code === 'session_expired') stop('expire'); throw error; } };
  const report = (event, failureCode = null) => {
    const value = { ...proofFor(state, now()), device_event_sequence: state.device_event_sequence + 1,
      event_type: event, failure_code: failureCode, reported_at_ms: now() };
    delete value.proved_at_ms;
    state = reduceProvisioning(state, { type: 'device_report', report: value, signature_verified: true }).state;
    const packet = channel.seal(signed({ kind: 'network-report', report: value, ...(lastIp ? { ip: lastIp } : {}) }, devicePrivateKey));
    if (terminal(state)) channel.destroy(); return packet;
  };
  return {
    get state() { return state ? { ...state } : null; },
    get networkCommitted() { return networkCommitted; },
    open(hello) {
      requireThat(hello?.version === 1 && hello.kind === 'hello' && typeof hello.clientNonce === 'string'
        && hello.clientNonce.length <= 64 && typeof hello.clientPublicKey === 'string' && hello.clientPublicKey.length <= 128, 'hello_invalid');
      requireThat(!state || terminal(state) || networkCommitted, 'service_busy');
      const next = authenticateGrant(hello, authorityPublicKey, deviceId, authorizationEpoch, resetCounter, now);
      requireThat(!usedRequests.has(next.provisioning_id), 'grant_replayed');
      const serverKey = ephemeral(), ack = { version: 1, kind: 'hello-ack', sessionId: nonce(), serverPublicKey: serverKey.publicKey,
        serverNonce: nonce(), proof: proofFor(next, now()) };
      const transcript = transcriptFor(hello, ack);
      const selectedChannel = secureChannel({ sharedSecret: serverKey.secret(hello.clientPublicKey), transcript, sessionId: ack.sessionId, role: 'robot' });
      usedRequests.add(next.provisioning_id); state = reduceProvisioning(next, { type: 'device_authenticated', proof: ack.proof, signature_verified: true }).state;
      channel?.destroy(); channel = selectedChannel; generation++;
      lastIp = null; lastProbe = null; currentAttempt = null; networkCommitted = false;
      ack.signature = signed(transcript, devicePrivateKey).signature; return ack;
    },
    async receive(packet) {
      requireThat(!networkCommitted, 'already_committed'); active();
      let message;
      try { message = channel.open(packet); } catch (error) { stop('invalidate'); throw error; }
      requireThat(same(message.binding, {
        provisioning_id: state.provisioning_id, challenge_id: state.challenge_id, nonce_b64url: state.nonce_b64url,
        device_id: state.device_id, owner_account_id: state.owner_account_id, terminal_id: state.terminal_id,
        auth_session_id: state.auth_session_id, authorization_epoch: state.authorization_epoch, factory_reset_counter: state.factory_reset_counter,
        issued_at_ms: state.issued_at_ms, expires_at_ms: state.expires_at_ms,
      }), 'message_binding');
      if (message.kind === 'cancel') { stop('cancel'); return null; }
      if (message.kind === 'commit-network') {
        requireThat(state.phase === 'awaiting_confirmation' && currentAttempt && lastProbe, 'commit_order');
        const proof = verified(message.proof, devicePublicKey);
        requireThat(proof.kind === 'ip-identity' && proof.deviceId === state.device_id && proof.provisioningId === state.provisioning_id
          && proof.ip === lastIp && proof.expiresAt === state.expires_at_ms && same(proof, lastProbe), 'ip_identity_mismatch');
        network.commit(currentAttempt); networkCommitted = true; lastProbe = null;
        const response = channel.seal({ kind: 'network-committed', provisioningId: state.provisioning_id }); channel.destroy(); return response;
      }
      requireThat(message.kind === 'wifi-config', 'operation_invalid'); validateWifi(message.ssid, message.password);
      const next = reduceProvisioning(state, { type: 'credentials_authenticated', authenticated: true,
        account_id: state.owner_account_id, terminal_id: state.terminal_id, session_id: state.auth_session_id });
      requireThat(next.effects.length === 1 && next.effects[0].type === 'write_credentials_once', 'credentials_replayed'); state = next.state;
      const attemptGeneration = generation, attempt = Object.freeze({ generation, provisioningId: state.provisioning_id });
      currentAttempt = attempt;
      try {
        let result;
        try { result = await network.connect(message.ssid, message.password, attempt); }
        catch (error) {
          network.rollback(attempt);
          if (!(error instanceof NetworkError) || !['network_timeout', 'network_unavailable'].includes(error.code)) throw error;
          if (attemptGeneration !== generation || terminal(state)) return null;
          if (error.code === 'network_timeout') { stop('expire'); return null; }
          return report('failure_reported', 'device_rejected');
        }
        if (attemptGeneration !== generation || terminal(state)) { network.rollback(attempt); return null; }
        if (now() > state.expires_at_ms) { stop('expire'); return null; }
        try {
          active(); requireThat(result && typeof result.connected === 'boolean', 'network_result_invalid');
          if (!result.connected) { network.rollback(attempt); return report('failure_reported', 'wifi_authentication_failed'); }
          lastIp = result.ip; return report('network_connected');
        } catch (error) { network.rollback(attempt); throw error; }
      } finally { message.password = undefined; message.ssid = undefined; }
    },
    ipProbe(challenge) {
      requireThat(!networkCommitted, 'already_committed'); active();
      requireThat(state.phase === 'awaiting_confirmation' && currentAttempt && network.isCandidateConnected(currentAttempt)
        && typeof challenge === 'string' && challenge.length <= 64, 'probe_order');
      lastProbe = { kind: 'ip-identity', deviceId, provisioningId: state.provisioning_id, nonce: challenge, ip: lastIp, expiresAt: state.expires_at_ms };
      return signed(lastProbe, devicePrivateKey);
    },
    expire() { stop('expire'); },
  };
}
