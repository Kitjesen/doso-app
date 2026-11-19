import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mqtt from 'mqtt';

const root = fileURLToPath(new URL('../', import.meta.url));
const tools = path.join(root, '.runtime', 'tools', 'mosquitto-2.1.2');
const brokerExecutable = process.env.MOSQUITTO_BIN || path.join(tools, 'mosquitto.exe');
const aclPlugin = process.env.MOSQUITTO_ACL_PLUGIN || path.join(tools, 'mosquitto_acl_file.dll');
const openssl = process.env.OPENSSL_BIN || 'C:\\Users\\99563\\miniconda3\\Library\\bin\\openssl.exe';

export async function createBrokerFixture({ names = ['device-a', 'device-b', 'gateway', 'disabled-device'], acl: rules, config: render } = {}) {
  await mkdir(path.join(root, '.runtime'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.runtime', 'run-'));
  const clients = new Set();
  const identities = {};
  const brokerLogs = [];
  const certPath = (name, extension) => path.join(directory, `${name}.${extension}`);
  const opensslConfig = path.join(directory, 'openssl.cnf');
  await writeFile(opensslConfig, '[req]\ndistinguished_name=dn\n[dn]\n');
  const runOpenSSL = (...args) => execFileSync(openssl, args, { windowsHide: true, stdio: 'pipe', env: { ...process.env, OPENSSL_CONF: opensslConfig } });

  function createCA(name) {
    runOpenSSL('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2',
      '-keyout', certPath(name, 'key'), '-out', certPath(name, 'pem'), '-subj', `/CN=DOSO-LAB-ONLY-${name}`,
      '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign,cRLSign');
  }
  async function createCertificate(name, caName, server = false) {
    runOpenSSL('req', '-new', '-newkey', 'rsa:2048', '-nodes', '-keyout', certPath(name, 'key'),
      '-out', certPath(name, 'csr'), '-subj', `/CN=${name}`);
    await writeFile(certPath(name, 'ext'), server
      ? 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=IP:127.0.0.1,DNS:localhost\n'
      : 'basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=clientAuth\n');
    runOpenSSL('x509', '-req', '-in', certPath(name, 'csr'), '-CA', certPath(caName, 'pem'),
      '-CAkey', certPath(caName, 'key'), '-CAcreateserial', '-out', certPath(name, 'pem'),
      '-days', '2', '-extfile', certPath(name, 'ext'));
    identities[name] = { cert: await readFile(certPath(name, 'pem')), key: await readFile(certPath(name, 'key')) };
  }
  createCA('ca');
  createCA('rogue-ca');
  for (const name of names) await createCertificate(name, 'ca');
  await createCertificate('server', 'ca', true);
  await createCertificate('rogue-device', 'rogue-ca');

  const portProbe = net.createServer();
  portProbe.listen(0, '127.0.0.1');
  await once(portProbe, 'listening');
  const port = portProbe.address().port;
  await new Promise((resolve, reject) => portProbe.close(error => error ? reject(error) : resolve()));
  const acl = rules ?? (['device-a', 'device-b'].map(name => `user ${name}\ntopic read doso/v1/devices/${name}/commands\ntopic write doso/v1/devices/${name}/telemetry\ntopic write doso/v1/devices/${name}/acks\n`).join('\n')
    + '\nuser gateway\ntopic write doso/v1/devices/+/commands\ntopic read doso/v1/devices/+/telemetry\ntopic read doso/v1/devices/+/acks\n');
  await writeFile(path.join(directory, 'acl.conf'), acl);
  const portable = value => value.replaceAll('\\', '/');
  const config = render?.({ directory, port, aclPlugin }) ?? `plugin_load acl ${portable(aclPlugin)}\nplugin_opt_acl_file ${portable(path.join(directory, 'acl.conf'))}\nlistener ${port} 127.0.0.1\nlistener_allow_anonymous false\nplugin_use acl\ncafile ${portable(certPath('ca', 'pem'))}\ncertfile ${portable(certPath('server', 'pem'))}\nkeyfile ${portable(certPath('server', 'key'))}\nrequire_certificate true\nuse_identity_as_username true\nuse_username_as_clientid true\npersistence false\nlog_dest stderr\nlog_type all\n`;
  const configFile = path.join(directory, 'mosquitto.conf');
  await writeFile(configFile, config);
  const broker = spawn(brokerExecutable, ['-c', configFile], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  broker.stdout.on('data', data => brokerLogs.push(data.toString()));
  broker.stderr.on('data', data => brokerLogs.push(data.toString()));
  const close = async () => {
    await Promise.all([...clients].map(client => client.endAsync(true).catch(() => {})));
    if (broker.pid && broker.exitCode === null && broker.signalCode === null) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Test Broker did not close within 3 seconds')), 3000);
        broker.once('close', () => { clearTimeout(timer); resolve(); });
        broker.kill();
      });
    }
    await writeFile(path.join(directory, 'broker.log'), brokerLogs.join(''));
  };
  try {
    await new Promise((resolve, reject) => {
      const deadline = setTimeout(() => reject(new Error(`Broker did not become ready: ${brokerLogs.join('')}`)), 8000);
      const check = data => {
        if (data.toString().includes('running')) { clearTimeout(deadline); resolve(); }
      };
      broker.stdout.on('data', check);
      broker.stderr.on('data', check);
      broker.once('error', error => { clearTimeout(deadline); reject(error); });
      broker.once('exit', code => { clearTimeout(deadline); reject(new Error(`Broker exited ${code}: ${brokerLogs.join('')}`)); });
    });
  } catch (error) { await close(); throw error; }

  function connect(name, overrides = {}) {
    return new Promise((resolve, reject) => {
      const client = mqtt.connect({ protocol: 'mqtts', host: '127.0.0.1', port, protocolVersion: 5,
        clientId: name, username: name,
        ...identities[name], reconnectPeriod: 0, connectTimeout: 3000, clean: true,
        properties: { sessionExpiryInterval: 0 }, rejectUnauthorized: true, ...overrides });
      clients.add(client);
      const timeout = setTimeout(() => { client.end(true); reject(new Error('MQTT connection timed out')); }, 4000);
      client.once('connect', () => { clearTimeout(timeout); resolve(client); });
      client.once('error', error => { clearTimeout(timeout); client.end(true); reject(error); });
      client.on('error', () => {});
    });
  }
  const ca = await readFile(certPath('ca', 'pem'));
  return { connect: (name, overrides) => connect(name, { ca, ...overrides }), close, directory,
    port, brokerLogs, brokerExecutable, aclPlugin, config };
}

export function receive(client, topic, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const onMessage = (actual, payload, packet) => {
      if (actual === topic) { clearTimeout(timer); client.off('message', onMessage); resolve({ payload: payload.toString(), packet }); }
    };
    const timer = setTimeout(() => { client.off('message', onMessage); reject(new Error(`No message on ${topic}`)); }, timeout);
    client.on('message', onMessage);
  });
}
