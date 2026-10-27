import { generateKeyPairSync } from 'node:crypto';
import { createAppClient, createRobotService } from './flow.mjs';
import { digest, ephemeral, NetworkError, nonce, ProtocolError, signed, transfer } from './protocol.mjs';

export const SYNTHETIC_WIFI = Object.freeze({ ssid: 'DOSO-LAB-合成', password: 'fixture-only-123' });
export function createRig({ attMtu = 23, networkMode = 'success', deferNetwork = false, wrongFactoryKey = false } = {}) {
  let clock = 1000000, candidate = null, current = 'EXISTING-SYNTHETIC', attempts = 0;
  const records = new Map(), pending = new Map();
  const now = () => clock;
  const authority = generateKeyPairSync('ed25519'), device = generateKeyPairSync('ed25519');
  const network = {
    get current() { return current; }, get attempts() { return attempts; }, get candidateConnected() { return candidate !== null; },
    isCandidateConnected(attempt) { return candidate?.owner === attempt && records.get(attempt)?.closed === false; },
    connect(ssid, password, attempt) {
      if (!attempt || records.has(attempt)) throw new ProtocolError('network_attempt_invalid');
      const number = ++attempts, record = { closed: false }; records.set(attempt, record);
      const accepted = networkMode !== 'wrong-password' && password === SYNTHETIC_WIFI.password;
      const finish = () => {
        if (networkMode === 'timeout') throw new NetworkError('network_timeout');
        if (accepted && !record.closed) candidate = { owner: attempt, ssid };
        return { connected: accepted, ...(accepted ? { ip: '192.0.2.10' } : {}) };
      };
      if (!deferNetwork) return Promise.resolve().then(finish);
      return new Promise((resolve, reject) => { pending.set(number, error => {
        pending.delete(number); if (error) { reject(error); return; }
        try { resolve(finish()); } catch (failure) { reject(failure); }
      }); });
    },
    finishLate(number = attempts, error = null) { pending.get(number)?.(error); },
    commit(attempt) {
      if (!network.isCandidateConnected(attempt)) throw new ProtocolError('network_not_connected');
      current = candidate.ssid; records.get(attempt).closed = true; candidate = null;
    },
    rollback(attempt) { const record = records.get(attempt); if (record) record.closed = true; if (candidate?.owner === attempt) candidate = null; },
  };
  const usedRequests = new Set();
  const robot = createRobotService({ deviceId: 'simulated-device-0001', authorizationEpoch: 1, resetCounter: 0, now,
    authorityPublicKey: authority.publicKey, devicePrivateKey: device.privateKey, devicePublicKey: device.publicKey, network, usedRequests });
  const wire = value => transfer(value, { attMtu, now });
  const newSession = () => {
    const binding = { provisioning_id: nonce(), challenge_id: nonce(), nonce_b64url: nonce(), device_id: 'simulated-device-0001',
      owner_account_id: 'simulated-owner', terminal_id: 'simulated-g20', auth_session_id: 'simulated-auth-session',
      authorization_epoch: 1, factory_reset_counter: 0, issued_at_ms: clock, expires_at_ms: clock + 60000 };
    const clientKey = ephemeral();
    const client = createAppClient({ binding, clientKey, now, factoryPublicKey: wrongFactoryKey ? generateKeyPairSync('ed25519').publicKey : device.publicKey, authorityPublicKey: authority.publicKey });
    const grant = signed({ version: 1, purpose: 'wifi-config', binding, clientKeySha256: digest(Buffer.from(client.publicKey, 'base64url')) }, authority.privateKey);
    const handshake = () => { const hello = client.hello(grant); const ack = robot.open(wire(hello)); client.acceptHello(wire(ack)); return { hello, ack }; };
    return { client, clientKey, grant, binding, handshake };
  };
  return { ...newSession(), newSession, robot, network, wire, now, advance: ms => { clock += ms; },
    // Only tests can issue altered synthetic grants; this is not a production issuer.
    resignGrant: body => signed(body, authority.privateKey),
    otherDeviceKey: () => generateKeyPairSync('ed25519').publicKey,
  };
}

export async function runScenario(name, attMtu = 23) {
  if (!['success', 'wrong-password', 'timeout', 'cancel'].includes(name)) throw new ProtocolError('scenario_invalid');
  const rig = createRig({ attMtu, networkMode: name === 'wrong-password' ? name : name === 'timeout' ? name : 'success', deferNetwork: name === 'cancel' });
  const events = ['simulated-discovery', 'test-configuration-grant-verified']; rig.handshake(); events.push('device-proof-verified', 'encrypted-session-ready');
  const packet = rig.client.credentials(SYNTHETIC_WIFI.ssid, SYNTHETIC_WIFI.password);
  const pending = rig.robot.receive(rig.wire(packet)); events.push('encrypted-config-delivered');
  if (name === 'cancel') {
    await rig.robot.receive(rig.wire(rig.client.cancel())); rig.network.finishLate(); await pending;
    events.push('cancelled', 'late-network-result-discarded');
  } else {
    const report = await pending;
    if (name === 'timeout') { rig.client.expire(); events.push('network-timeout', 'old-network-preserved'); }
    else {
      rig.client.acceptReport(rig.wire(report));
      if (name === 'success') {
        const proof = rig.robot.ipProbe(rig.client.probe());
        const commit = rig.client.confirmNetwork(proof);
        const result = await rig.robot.receive(rig.wire(commit)); rig.client.acceptCommit(rig.wire(result));
        events.push('simulated-network-connected', 'same-device-ip-proof-verified', 'network-configuration-committed');
      } else events.push('wifi-authentication-failed', 'old-network-preserved');
    }
  }
  return { scope: 'offline-protocol-simulation', scenario: name, attMtu, events,
    networkOutcome: name === 'success' ? 'verified-network-awaiting-bind' : name,
    domainPhase: rig.client.state.phase, cloudBindingCommitted: false, networkAttempts: rig.network.attempts,
    oldNetworkPreserved: rig.network.current === 'EXISTING-SYNTHETIC', actualBleOrWifiUsed: false };
}
