import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, verify } from 'node:crypto';
import { SimulatedDeviceIdentity } from '../../simulator/robot-protocol-simulator.ts';
import {
  InMemoryRobotProjectionStore, TrustedRobotIngress,
} from '../../../src/domain/device-protocol/index.ts';
import { createBrokerFixture, receive } from './broker-fixture.js';

const NOW = 1_800_000_000_000;
// This lab ID matches the fixture certificate and ACL, not a production UUID.
const DEVICE_ID = 'device-a';
const TELEMETRY_TOPIC = `doso/v1/devices/${DEVICE_ID}/telemetry`;

function createIngressFixture() {
  const identity = new SimulatedDeviceIdentity(DEVICE_ID);
  const device = {
    version: 1,
    device_id: DEVICE_ID,
    owner_account_id: 'account-lab',
    public_key_pem: identity.publicKeyPem,
    public_key_fingerprint: createHash('sha256').update(identity.publicKeyPem).digest('hex'),
    lifecycle: 'owned',
    authorization_epoch: 7,
    active_boot_id: 'boot-lab',
    last_telemetry_sequence: 0,
    health: null,
  };
  const store = new InMemoryRobotProjectionStore([device]);
  const ingress = new TrustedRobotIngress({
    now: () => NOW,
    store,
    verifier: {
      verify(publicKeyPem, canonicalPayload, signatureB64Url) {
        return verify(null, Buffer.from(canonicalPayload), publicKeyPem, Buffer.from(signatureB64Url, 'base64url'));
      },
    },
  });
  const unsigned = {
    protocol_version: 1,
    device_id: DEVICE_ID,
    authorization_epoch: device.authorization_epoch,
    boot_id: device.active_boot_id,
    sequence: 1,
    captured_at_ms: NOW,
    kind: 'diagnostics.health',
    payload: { battery_percent: 82, sensor_status: 'ok', network_status: 'online' },
  };
  const frame = { ...unsigned, signature_b64url: identity.sign(unsigned) };
  return { store, ingress, frame };
}

test('signed telemetry crosses loopback MQTT before trusted ingress', { timeout: 45000 }, async t => {
  const lab = await createBrokerFixture();
  t.after(() => lab.close());
  const gateway = await lab.connect('gateway');
  const device = await lab.connect(DEVICE_ID);
  await gateway.subscribeAsync(TELEMETRY_TOPIC, { qos: 1 });

  async function deliver(fixture, frame) {
    const [received] = await Promise.all([
      receive(gateway, TELEMETRY_TOPIC),
      device.publishAsync(TELEMETRY_TOPIC, JSON.stringify(frame), { qos: 1, retain: false }),
    ]);
    return fixture.ingress.accept(JSON.parse(received.payload));
  }

  await t.test('commits valid signed telemetry received through MQTT exactly once', async () => {
    const f = createIngressFixture();
    assert.deepEqual(await deliver(f, f.frame), { accepted: true, frame: 'telemetry', sequence: 1 });
    assert.equal(f.store.commitCount, 1);
    const projection = await f.store.readDevice(DEVICE_ID);
    assert.equal(projection.last_telemetry_sequence, 1);
    assert.deepEqual({ ...projection.health }, {
      sequence: 1, captured_at_ms: NOW,
      battery_percent: 82, sensor_status: 'ok', network_status: 'online',
    });
  });

  await t.test('rejects replayed telemetry received through MQTT without changing the projection', async () => {
    const f = createIngressFixture();
    assert.equal((await deliver(f, f.frame)).accepted, true);
    const before = await f.store.readDevice(DEVICE_ID);
    assert.deepEqual(await deliver(f, f.frame), { accepted: false, reason: 'sequence_replay', retryable: false });
    assert.equal(f.store.commitCount, 1);
    assert.deepEqual(await f.store.readDevice(DEVICE_ID), before);
  });

  await t.test('rejects a tampered signed payload received through MQTT without changing the projection', async () => {
    const f = createIngressFixture();
    const before = await f.store.readDevice(DEVICE_ID);
    f.frame.payload.battery_percent = 1;
    assert.deepEqual(await deliver(f, f.frame), { accepted: false, reason: 'invalid_signature', retryable: false });
    assert.equal(f.store.commitCount, 0);
    assert.deepEqual(await f.store.readDevice(DEVICE_ID), before);
  });
});
