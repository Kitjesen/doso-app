import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createBrokerFixture, receive } from './broker-fixture.js';

test('loopback mTLS transport and topic isolation', { timeout: 45000 }, async t => {
  const lab = await createBrokerFixture();
  t.after(() => lab.close());
  const results = [];
  async function check(name, fn) {
    await t.test(name, async () => { await fn(); results.push({ name, result: 'passed' }); });
  }
  const gateway = await lab.connect('gateway');
  let a = await lab.connect('device-a');
  const b = await lab.connect('device-b');
  const topic = (name, kind) => `doso/v1/devices/${name}/${kind}`;

  await check('valid mTLS devices and gateway exchange own telemetry and acknowledgements', async () => {
    await gateway.subscribeAsync(['doso/v1/devices/+/telemetry', 'doso/v1/devices/+/acks'], { qos: 1 });
    for (const [client, name] of [[a, 'device-a'], [b, 'device-b']]) for (const kind of ['telemetry', 'acks']) {
      const message = receive(gateway, topic(name, kind));
      await client.publishAsync(topic(name, kind), JSON.stringify({ simulated: true, device: name }), { qos: 1, retain: false });
      assert.match((await message).payload, /"simulated":true/);
    }
  });
  await check('clients without certificates and clients signed by another CA are rejected', async () => {
    await assert.rejects(lab.connect('no-certificate'), /certificate|socket|TLS|ssl|alert/i);
    await assert.rejects(lab.connect('rogue-device'), /certificate|socket|TLS|ssl|alert/i);
  });
  await check('client rejects a server certificate with a wrong hostname', async () => {
    await assert.rejects(lab.connect('device-a', { servername: 'wrong-host.invalid' }), /hostname|altname|certificate/i);
  });
  await check('device A cannot publish B telemetry, commands or gateway-only topics', async () => {
    for (const denied of [topic('device-b', 'telemetry'), topic('device-b', 'acks'), topic('device-a', 'commands'), '$CONTROL/dynamic-security/v1']) {
      await assert.rejects(a.publishAsync(denied, 'forbidden', { qos: 1, retain: false }), error => error.code === 135);
    }
  });
  await check('certificate without an ACL has no message permissions', async () => {
    const disabled = await lab.connect('disabled-device');
    await assert.rejects(disabled.publishAsync(topic('disabled-device', 'telemetry'), 'forbidden', { qos: 1 }), error => error.code === 135);
    await disabled.endAsync();
  });
  await check('A never receives B commands, including with a wildcard subscription', async () => {
    const leaked = [];
    const observe = actual => { if (actual === topic('device-b', 'commands')) leaked.push(actual); };
    a.on('message', observe);
    await a.subscribeAsync(topic('device-b', 'commands')).catch(() => {});
    await a.subscribeAsync('doso/v1/devices/+/commands').catch(() => {});
    await a.subscribeAsync(topic('device-a', 'commands'), { qos: 1 });
    await b.subscribeAsync(topic('device-b', 'commands'), { qos: 1 });
    const delivery = receive(b, topic('device-b', 'commands'));
    await gateway.publishAsync(topic('device-b', 'commands'), 'diagnostics.health_check', { qos: 1, retain: false });
    assert.equal((await delivery).payload, 'diagnostics.health_check');
    await new Promise(resolve => setTimeout(resolve, 200));
    const ownDelivery = receive(a, topic('device-a', 'commands'));
    await gateway.publishAsync(topic('device-a', 'commands'), 'own-path-still-active', { qos: 1, retain: false });
    assert.equal((await ownDelivery).payload, 'own-path-still-active');
    assert.equal(a.connected, true);
    a.off('message', observe);
    assert.deepEqual(leaked, []);
  });
  await check('forged username and B client ID preserve A identity and do not kick B', async () => {
    await a.endAsync();
    a = await lab.connect('device-a', { username: 'device-b', clientId: 'device-b' });
    await assert.rejects(a.publishAsync(topic('device-b', 'telemetry'), 'forbidden', { qos: 1 }), error => error.code === 135);
    assert.equal(b.connected, true);
    const delivery = receive(b, topic('device-b', 'commands'));
    await gateway.publishAsync(topic('device-b', 'commands'), 'identity-check', { qos: 1, retain: false });
    assert.equal((await delivery).payload, 'identity-check');
    const telemetry = receive(gateway, topic('device-a', 'telemetry'));
    await a.publishAsync(topic('device-a', 'telemetry'), 'identity-is-a', { qos: 1, retain: false });
    assert.equal((await telemetry).payload, 'identity-is-a');
  });
  await check('QoS 1 non-retained health command is delivered and not replayed to a new subscription', async () => {
    await a.subscribeAsync(topic('device-a', 'commands'), { qos: 1 });
    const delivery = receive(a, topic('device-a', 'commands'));
    await gateway.publishAsync(topic('device-a', 'commands'), 'diagnostics.health_check', { qos: 1, retain: false, properties: { messageExpiryInterval: 2 } });
    const received = await delivery;
    assert.equal(received.packet.qos, 1);
    assert.equal(received.packet.retain, false);
    await a.endAsync();
    a = await lab.connect('device-a');
    const unexpected = [];
    a.on('message', actual => unexpected.push(actual));
    await a.subscribeAsync(topic('device-a', 'commands'), { qos: 1 });
    await new Promise(resolve => setTimeout(resolve, 250));
    assert.deepEqual(unexpected, []);
  });

  assert.equal(results.length, 8);
  const sha256 = async file => createHash('sha256').update(await readFile(file)).digest('hex');
  await writeFile(path.join(lab.directory, 'evidence.json'), JSON.stringify({
    scope: 'LOCAL real Mosquitto; simulated clients; no cloud, robot, motion, gateway or opt-in implementation',
    tested_at: new Date().toISOString(), broker_version: '2.1.2', mqtt_client: '5.16.1', listener: '127.0.0.1', port: lab.port,
    broker_sha256: await sha256(lab.brokerExecutable), acl_plugin_sha256: await sha256(lab.aclPlugin),
    cases: results, unverified: ['production identity provisioning/revocation', 'device opt-in and out-of-process network traffic', 'actual Gateway/ingress', '5G', 'broker restart', 'clustering', 'business deduplication', 'offline expiry']
  }, null, 2));
  console.log(`Evidence: ${path.relative(process.cwd(), path.join(lab.directory, 'evidence.json'))}`);
});
