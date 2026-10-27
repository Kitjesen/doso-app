import process from 'node:process';
import { isAbsolute, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import grpc from '@grpc/grpc-js';
import { parseTarget } from '../src/config.js';
import { closeServer, createGatewayServer, listen } from '../src/httpServer.js';
import { loadRobotControl } from '../src/proto.js';
import { createReadOnlyGrpcAdapter } from '../src/readOnlyGrpc.js';

const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_HTTP_PORT = 8120;
const GRPC_SHUTDOWN_TIMEOUT_MS = 500;
const GET_CONTROL_STATUS = 'GetControlStatus';

function validToken(value) {
  if (typeof value !== 'string' || !/^[\x21-\x7e]{32,256}$/u.test(value)) {
    throw new Error('DOSO_BRAINSTEM_BEARER_TOKEN must be 32-256 non-space printable ASCII characters');
  }
  return value;
}

function validProtoRoot(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) {
    throw new Error('DOSO_BRAINSTEM_PROTO_ROOT must be an absolute path');
  }
  return resolve(value);
}

function validPort(value, name = 'DOSO_BRAINSTEM_HTTP_PORT') {
  const candidate = value === undefined || value === '' ? DEFAULT_HTTP_PORT : value;
  if ((typeof candidate !== 'number' && !/^\d+$/u.test(candidate))
    || !Number.isInteger(Number(candidate))
    || Number(candidate) < 0
    || Number(candidate) > 65_535) {
    throw new Error(`${name} must be between 0 and 65535`);
  }
  return Number(candidate);
}

function bindGrpc(server) {
  return new Promise((resolveBind, rejectBind) => {
    server.bindAsync(
      `${LOOPBACK_HOST}:0`,
      grpc.ServerCredentials.createInsecure(),
      (error, port) => error ? rejectBind(error) : resolveBind(port),
    );
  });
}

export function shutdownGrpc(server, timeoutMs = GRPC_SHUTDOWN_TIMEOUT_MS) {
  return new Promise((resolveShutdown) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveShutdown();
    };
    const timer = setTimeout(() => {
      server.forceShutdown();
      finish();
    }, timeoutMs);
    server.tryShutdown(finish);
  });
}

function unavailableError() {
  return {
    code: grpc.status.UNIMPLEMENTED,
    details: 'Unavailable in the local read-only protocol fixture.',
  };
}

function fixtureImplementation(RobotControl) {
  const implementation = Object.fromEntries(
    Object.entries(RobotControl.service).map(([methodName, metadata]) => [
      methodName,
      metadata.responseStream
        ? (call) => call.emit('error', unavailableError())
        : (_call, callback) => callback(unavailableError()),
    ]),
  );
  implementation[GET_CONTROL_STATUS] = (_call, callback) => callback(null, {
    fsm: {
      kind: 'CMS_STATE_KIND_GROUNDED',
      transition: 'CMS_TRANSITION_KIND_NONE',
    },
    motorOutputEnabled: false,
    owner: 'CONTROL_OWNER_NONE',
    criticalMotorFault: false,
  });
  return implementation;
}

export async function startLocalProtocolFixture({
  protoRoot,
  bearerToken,
  httpPort = DEFAULT_HTTP_PORT,
  log = console.log,
} = {}) {
  const safeProtoRoot = validProtoRoot(protoRoot);
  const safeToken = validToken(bearerToken);
  const safeHttpPort = validPort(httpPort, 'httpPort');
  const RobotControl = await loadRobotControl(safeProtoRoot);
  const exactMethodNames = Object.keys(RobotControl.service)
    .map((methodName) => `brainstem.api.v1.RobotControl/${methodName}`);
  const grpcServer = new grpc.Server();
  grpcServer.addService(RobotControl.service, fixtureImplementation(RobotControl));

  let grpcPort;
  let adapter;
  let httpServer;
  let closed = false;
  try {
    grpcPort = await bindGrpc(grpcServer);
    const config = {
      target: parseTarget(`${LOOPBACK_HOST}:${grpcPort}`),
      protoRoot: safeProtoRoot,
      bearerToken: safeToken,
      grpc: { transport: 'local-insecure', timeoutMs: 3_000 },
      http: {
        host: LOOPBACK_HOST,
        port: safeHttpPort,
        allowedOrigins: new Set(),
        maxConcurrent: 4,
      },
    };
    adapter = await createReadOnlyGrpcAdapter(config);
    httpServer = await createGatewayServer({ config, adapter });
    const httpAddress = await listen(httpServer, config.http);
    const close = async () => {
      if (closed) return;
      closed = true;
      if (httpServer?.listening) await closeServer(httpServer);
      adapter?.close();
      await shutdownGrpc(grpcServer);
    };
    log({
      provenance: 'local-protocol-fixture',
      listeners: {
        grpc: `${LOOPBACK_HOST}:${grpcPort}`,
        http: `${LOOPBACK_HOST}:${httpAddress.port}`,
      },
      implementedMethods: [`brainstem.api.v1.RobotControl/${GET_CONTROL_STATUS}`],
      unimplementedMethods: exactMethodNames.filter((name) => !name.endsWith(`/${GET_CONTROL_STATUS}`)),
    });
    return Object.freeze({
      provenance: 'local-protocol-fixture',
      grpc: Object.freeze({ host: LOOPBACK_HOST, port: grpcPort }),
      http: Object.freeze({ host: LOOPBACK_HOST, port: httpAddress.port }),
      close,
    });
  } catch (error) {
    if (httpServer?.listening) await closeServer(httpServer).catch(() => {});
    adapter?.close();
    if (grpcPort !== undefined) await shutdownGrpc(grpcServer);
    throw error;
  }
}

async function runCli() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== '--local-protocol-fixture') {
    throw new Error('Explicit --local-protocol-fixture opt-in is required');
  }
  const fixture = await startLocalProtocolFixture({
    protoRoot: process.env.DOSO_BRAINSTEM_PROTO_ROOT,
    bearerToken: process.env.DOSO_BRAINSTEM_BEARER_TOKEN,
    httpPort: process.env.DOSO_BRAINSTEM_HTTP_PORT,
    log: (entry) => console.log(JSON.stringify(entry)),
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    process.stdin.removeAllListeners('data');
    process.stdin.pause();
    await fixture.close();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (value) => {
    if (value.trim() === 'stop') void stop();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(() => {
    console.error('local_protocol_fixture_failed');
    process.exitCode = 1;
  });
}
