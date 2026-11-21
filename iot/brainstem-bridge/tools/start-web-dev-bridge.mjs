import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createDevLanBridge } from '../src/devLanBridge.js';

function parseArgs(argv) {
  let port = Number(process.env.DOSO_WEB_DEV_BRIDGE_PORT || 8121);
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--port' && argv[index + 1]) {
      port = Number(argv[++index]);
    } else {
      throw new Error(`Unsupported argument: ${flag}`);
    }
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid --port');
  return { port };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const bridge = await createDevLanBridge({
    listenHost: '127.0.0.1',
    listenPort: options.port,
  });
  console.log(JSON.stringify({
    event: 'ready',
    service: 'doso-web-dev-lan-bridge',
    host: bridge.host,
    port: bridge.port,
    origin: bridge.origin,
  }));

  let shuttingDown = false;
  const stop = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await bridge.close().catch(() => undefined);
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
