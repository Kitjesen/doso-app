import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { createGatewayServer, listen } from './httpServer.js';
import { PROTO_RELATIVE_PATH } from './proto.js';
import { createReadOnlyGrpcAdapter } from './readOnlyGrpc.js';

let adapter;
let server;

async function shutdown() {
  server?.close();
  adapter?.close();
}

async function main() {
  const config = loadConfig();
  const protoBytes = await readFile(join(config.protoRoot, PROTO_RELATIVE_PATH));
  const protoSha256 = createHash('sha256').update(protoBytes).digest('hex');
  adapter = await createReadOnlyGrpcAdapter(config);
  server = await createGatewayServer({ config, adapter });
  const address = await listen(server, config.http);
  // Deliberately logs no bearer token, certificate material, or upstream error detail.
  console.log(JSON.stringify({
    event: 'brainstem_bridge_listening',
    address: address.address,
    port: address.port,
    transport: adapter.transport,
    protoSha256,
  }));
}

process.once('SIGINT', () => void shutdown().finally(() => process.exit(0)));
process.once('SIGTERM', () => void shutdown().finally(() => process.exit(0)));

main().catch(() => {
  void shutdown().finally(() => {
    console.error(JSON.stringify({ event: 'brainstem_bridge_start_failed' }));
    process.exitCode = 1;
  });
});
