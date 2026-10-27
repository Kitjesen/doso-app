import { pathToFileURL } from 'node:url';
import { createSimulationGateway } from '../src/simulationGateway.js';

export async function startLocalMotion(env = process.env) {
  const gateway = await createSimulationGateway({
    protoRoot: env.DOSO_BRAINSTEM_PROTO_ROOT,
    grpcTarget: '127.0.0.1:13147',
    observerOrigin: 'http://127.0.0.1:13148',
    expectedInstanceId: env.DOSO_BRAINSTEM_SIMULATION_INSTANCE_ID,
    port: 8122,
  });
  const address = await gateway.start();
  console.log(JSON.stringify({ event: 'brainstem_local_motion_listening', simulationOnly: true, address: address.address, port: address.port }));
  return gateway;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startLocalMotion().then((gateway) => {
    let stopping;
    const stop = () => {
      stopping ??= gateway.close().then(
        () => process.exit(0),
        () => {
          console.error(JSON.stringify({ event: 'brainstem_local_motion_shutdown_failed' }));
          process.exit(1);
        },
      );
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  }).catch(() => {
    console.error(JSON.stringify({ event: 'brainstem_local_motion_start_failed' }));
    process.exitCode = 1;
  });
}
