import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { createLocalControlFixture, summarizeSamples } from './local-grpc-fixture.mjs';

const grpc = createRequire(import.meta.url)('@grpc/grpc-js');

export function createFixtureClient(fixture, principal = 'pc-baseline@dev') {
  const Client = grpc.makeGenericClientConstructor(fixture.definition, 'SimulationReceiver');
  const client = new Client(`127.0.0.1:${fixture.port}`, grpc.credentials.createInsecure());
  return {
    call(method, request = {}, timeoutMs = 1_000) {
      const metadata = new grpc.Metadata(); metadata.set('x-doso-dev-client', principal);
      return new Promise((resolve, reject) => client[method](request, metadata, { deadline: Date.now() + timeoutMs }, (error, value) => error ? reject(error) : resolve(value)));
    },
    close: () => client.close(),
  };
}

export async function runPcBaseline({ samples = 250 } = {}) {
  if (!Number.isInteger(samples) || samples < 2 || samples > 3_000) throw new Error('samples must be 2..3000');
  const fixture = await createLocalControlFixture({ maxRecords: samples });
  const client = createFixtureClient(fixture);
  const roundTrips = [];
  let failure = null;
  try {
    await client.call('Enable'); await client.call('StandUp');
    const lease = await client.call('AcquireControl', { clientId: 'pc-baseline@dev' });
    assert.equal(lease.accepted, true);
    let lastSend = -Infinity;
    for (let index = 1; index <= samples; index++) {
      // No catch-up burst: preserve the client's 20 ms minimum wire interval.
      const remaining = 20 - (performance.now() - lastSend);
      if (remaining > 16) await sleep(remaining - 16);
      // Windows timer quantization can turn a 20 ms sleep into 31 ms; this bounded
      // sender-only precision wait is a measurement aid, not production pacing.
      while (performance.now() - lastSend < 20) { /* at most 20 ms */ }
      const start = performance.now(); lastSend = start;
      const ack = await client.call('WalkChecked', { token: lease.token, sequence: String(index), direction: { x: index === 1 || index === samples ? 0 : .1, y: 0, z: 0 } });
      roundTrips.push(performance.now() - start);
      if (!ack.accepted || ack.reason !== 0 || ack.sequence !== String(index)) {
        failure = { sequence: String(index), accepted: ack.accepted, reason: ack.reason, ackSequence: ack.sequence };
        break;
      }
    }
    const released = await client.call('ReleaseControl', { token: lease.token });
    assert.equal(released.grpcLeaseActive, false);
    const measurement = fixture.snapshot();
    assert.equal(measurement.moving, false);
    return { ...measurement, passed: !failure && measurement.received === samples && measurement.accepted === samples && measurement.receivedHz >= 49 && measurement.receivedHz <= 51,
      requestedSamples: samples, firstFailure: failure, targetHz: 50, transport: 'PC loopback plaintext HTTP/2 gRPC; existing grpc-js client',
      roundTripMs: summarizeSamples(roundTrips), pacing: '20 ms minimum monotonic send spacing; bounded precision wait for Windows timer quantization',
      latencyScope: 'PC client send to PC client ACK; excludes G20/input and clock synchronization' };
  } finally { client.close(); await fixture.close(); }
}

async function serve() {
  const fixture = await createLocalControlFixture();
  const input = createInterface({ input: process.stdin });
  let stopping = false;
  const stop = async () => {
    if (stopping) return; stopping = true;
    clearTimeout(timer); input.close();
    console.log(JSON.stringify(fixture.snapshot()));
    await fixture.close();
  };
  const timer = setTimeout(() => void stop(), 600_000);
  process.once('SIGINT', () => void stop()); process.once('SIGTERM', () => void stop());
  input.once('close', () => void stop());
  input.on('line', (line) => {
    try {
      if (line === 'stop') void stop();
      else if (line === 'snapshot') console.log(JSON.stringify(fixture.snapshot()));
      else if (line.startsWith('fault ')) { fixture.setFault(JSON.parse(line.slice(6))); console.log(JSON.stringify({ source: 'SIMULATION', faultUpdated: true })); }
      else console.log(JSON.stringify({ source: 'SIMULATION', error: 'Unknown command' }));
    } catch { console.log(JSON.stringify({ source: 'SIMULATION', error: 'Invalid fault command' })); }
  });
  console.log(JSON.stringify({ source: 'SIMULATION', host: fixture.host, port: fixture.port, boundedLifetimeMs: 600_000 }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const run = args.length === 1 && args[0] === '--serve' ? serve()
    : args.length === 0 ? runPcBaseline().then((value) => { console.log(JSON.stringify(value, null, 2)); if (!value.passed) process.exitCode = 1; })
      : Promise.reject(new Error('Use no arguments for a baseline or --serve for the bounded receiver'));
  run.catch((error) => { console.error(error.message); process.exitCode = 1; });
}
