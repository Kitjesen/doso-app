import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createLocalBrainstemSimServer } from '../src/localBrainstemSimServer.js';

function parseArgs(argv) {
  let port = 13145;
  let statePort = 13146;
  let transitionDurationMs = 300;
  let platformConfigured = true;
  let recoveryConfigured = true;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--port' && argv[index + 1]) {
      port = Number(argv[++index]);
    } else if (flag === '--state-port' && argv[index + 1]) {
      statePort = Number(argv[++index]);
    } else if (flag === '--no-state-port') {
      statePort = null;
    } else if (flag === '--transition-ms' && argv[index + 1]) {
      transitionDurationMs = Number(argv[++index]);
    } else if (flag === '--platform') {
      platformConfigured = true;
    } else if (flag === '--no-platform') {
      platformConfigured = false;
    } else if (flag === '--recovery') {
      recoveryConfigured = true;
    } else if (flag === '--no-recovery') {
      recoveryConfigured = false;
    } else {
      throw new Error(`Unsupported argument: ${flag}`);
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid --port');
  if (statePort !== null && (!Number.isInteger(statePort) || statePort < 1 || statePort > 65535)) {
    throw new Error('Invalid --state-port');
  }
  if (!Number.isInteger(transitionDurationMs) || transitionDurationMs < 0 || transitionDurationMs > 5000) {
    throw new Error('Invalid --transition-ms');
  }
  return { port, statePort, transitionDurationMs, platformConfigured, recoveryConfigured };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const sim = await createLocalBrainstemSimServer({
    host: '127.0.0.1',
    port: options.port,
    statePort: options.statePort,
    transitionDurationMs: options.transitionDurationMs,
    platformConfigured: options.platformConfigured,
    recoveryConfigured: options.recoveryConfigured,
  });
  console.log(JSON.stringify({
    event: 'ready',
    service: 'local-brainstem-sim',
    host: sim.host,
    port: sim.port,
    statePort: sim.statePort,
    platformConfigured: options.platformConfigured,
    recoveryConfigured: options.recoveryConfigured,
    simulation: true,
  }));

  let shuttingDown = false;
  const stop = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await sim.close().catch(() => undefined);
    process.exit(0);
  };
  process.once('SIGINT', () => { void stop(); });
  process.once('SIGTERM', () => { void stop(); });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: 'error', message: error instanceof Error ? error.message : String(error) }));
    process.exit(1);
  });
}
