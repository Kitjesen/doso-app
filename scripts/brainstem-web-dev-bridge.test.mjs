import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
import { createLocalBrainstemSimServer } from '../iot/brainstem-bridge/src/localBrainstemSimServer.js';
import { createDevLanBridge } from '../iot/brainstem-bridge/src/devLanBridge.js';

const moduleUrl = (code) => `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`;

async function loadWebAppServices({ devMode, origin }) {
  const prevDev = globalThis.__DEV__;
  const prevBridge = globalThis.__dosoWebDevBrainstemBridge;
  globalThis.__DEV__ = devMode;
  delete globalThis.__dosoWebDevBrainstemBridge;

  const nonce = `${Date.now()}-${Math.random()}`;
  const rn = moduleUrl(
    `export const Platform = { OS: 'web' }; export const AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) }; //${nonce}`,
  );
  const expo = moduleUrl(`export const requireOptionalNativeModule = () => null; //${nonce}`);

  const transpile = async (relPath, rewrites = []) => {
    let source = await readFile(new URL(relPath, import.meta.url), 'utf8');
    let out = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    for (const [from, to] of rewrites) out = out.replaceAll(from, to);
    return moduleUrl(`${out}\n//${nonce}`);
  };

  const webBridgeUrl = await transpile('../src/services/brainstemWebDevBridge.ts', [
    ["from 'react-native'", `from '${rn}'`],
  ]);
  const grpcUrl = await transpile('../src/services/brainstemGrpc.ts', [
    ["from 'expo'", `from '${expo}'`],
    ["from 'react-native'", `from '${rn}'`],
  ]);
  const recoveryUrl = await transpile('../src/features/control/robotRecovery.ts', [
    ["from './controlOperations.ts'", `from '${new URL('../src/features/control/controlOperations.ts', import.meta.url).href}'`],
  ]);
  const controlUrl = await transpile('../src/services/brainstemControl.ts', [
    ["from 'expo'", `from '${expo}'`],
    ["from 'react-native'", `from '${rn}'`],
    ["from './brainstemGrpc'", `from '${grpcUrl}'`],
    ["from '../features/control/robotRecovery'", `from '${recoveryUrl}'`],
  ]);
  const controlSessionUrl = await transpile('../src/features/control/brainstemControlSession.ts', [
    ["from '../../services/brainstemImu.ts'", `from '${new URL('../src/services/brainstemImu.ts', import.meta.url).href}'`],
    ["from './robotRecovery.ts'", `from '${recoveryUrl}'`],
    ["from '../../services/directRobotConnection.ts'", `from '${await transpile('../src/services/directRobotConnection.ts', [
      ["from '../features/control/robotModeCapabilities.ts'", `from '${new URL('../src/features/control/robotModeCapabilities.ts', import.meta.url).href}'`],
    ])}'`],
    ["from './robotModeCapabilities.ts'", `from '${new URL('../src/features/control/robotModeCapabilities.ts', import.meta.url).href}'`],
  ]);

  const webBridgeMod = await import(webBridgeUrl);
  let createdBridge = null;
  if (devMode && origin) {
    createdBridge = webBridgeMod.createBrainstemWebDevBridge({ origin, registerUnload: false });
    globalThis.__dosoWebDevBrainstemBridge = createdBridge;
  }
  const grpcApi = await import(grpcUrl);
  const controlApi = await import(controlUrl);
  const sessionApi = await import(controlSessionUrl);

  return {
    grpcApi,
    controlApi,
    sessionApi,
    webBridgeMod,
    cleanup() {
      createdBridge?.dispose();
      globalThis.__DEV__ = prevDev;
      globalThis.__dosoWebDevBrainstemBridge = prevBridge;
    },
  };
}

test('non-dev web build keeps Brainstem gRPC and control unavailable even if global bridge is set', async () => {
  const env = await loadWebAppServices({ devMode: false, origin: 'http://127.0.0.1:8121' });
  try {
    globalThis.__dosoWebDevBrainstemBridge = env.webBridgeMod.createBrainstemWebDevBridge({
      origin: 'http://127.0.0.1:8121',
      registerUnload: false,
    });
    assert.equal(env.webBridgeMod.installBrainstemWebDevBridge(), false);
    assert.equal(env.grpcApi.isBrainstemGrpcAvailable(), false);
    assert.equal(env.grpcApi.isBrainstemLanAvailable(), false);
    assert.equal(env.controlApi.isBrainstemControlAvailable(), false);
    await assert.rejects(
      env.grpcApi.readBrainstemGrpcStatus({ endpoint: { host: '127.0.0.1', port: 13145, transport: 'lan-dev' }, requestId: 'nondev-1' }),
      (error) => error.code === 'native_unavailable',
    );
    await assert.rejects(
      env.controlApi.brainstemControlTransport.open({ host: '127.0.0.1', port: 13145, transport: 'lan-dev' }, ''),
      (error) => error.code === 'native_unavailable',
    );
  } finally {
    env.cleanup();
  }
});

test('__DEV__ web bridge completes real BrainstemControlSession lifecycle against 127.0.0.1 simulation', async () => {
  const sim = await createLocalBrainstemSimServer({
    port: 0,
    transitionDurationMs: 0,
    leaseDurationMs: 400,
    imuIntervalMs: 30,
  });
  const bridge = await createDevLanBridge({ listenPort: 0 });
  const env = await loadWebAppServices({ devMode: true, origin: bridge.origin });
  const session = new env.sessionApi.BrainstemControlSession(env.controlApi.brainstemControlTransport, () => true);

  try {
    assert.equal(env.grpcApi.isBrainstemGrpcAvailable(), true);
    assert.equal(env.grpcApi.isBrainstemLanAvailable(), true);
    assert.equal(env.grpcApi.isBrainstemLocalIdentityAvailable(), false);
    assert.equal(env.controlApi.isBrainstemControlAvailable(), true);

    const endpoint = { host: sim.host, port: sim.port, transport: 'lan-dev' };
    const status = await env.grpcApi.readBrainstemGrpcStatus({ endpoint, requestId: 'web-read-status' });
    assert.equal(status.transport, 'grpc-lan');
    assert.equal(status.mutualTlsVerified, false);
    assert.equal(status.status.fsmKind, 'grounded');

    await assert.rejects(
      env.grpcApi.readBrainstemGrpcStatus({ endpoint: { host: sim.host, port: sim.port, transport: 'tls' }, requestId: 'web-tls-blocked' }),
      (error) => error.code === 'native_unavailable',
    );

    assert.equal(await session.connect(endpoint, ''), true);
    assert.equal(session.state.connected, true);
    assert.equal(session.state.transport, 'grpc-lan');

    await session.action('enable');
    assert.equal(session.state.status.motorOutputEnabled, true);
    await session.action('stand-up');
    assert.equal(session.state.status.fsmKind, 'standing');
    await session.action('switch-profile', 'stairs');
    assert.equal(session.state.profile.activeModeId, 'stairs');

    assert.equal(session.prepareManualControl(), true);
    await session.acquire();
    assert.equal(session.state.leaseActive, true);
    assert.equal(session.state.sequence, 1);

    await session.drive({ x: 0, y: -1.0 });
    assert.equal(session.state.sequence, 2);
    assert.equal(session.state.status.fsmKind, 'walking');
    assert.deepEqual(sim.snapshot().velocity, { x: 1.0, y: 0, z: 0 });

    await session.interrupt();
    assert.equal(session.state.leaseActive, false);
    assert.equal(session.state.status.fsmKind, 'standing');

    await session.disconnect();
    assert.equal(session.state.connected, false);
  } finally {
    session.dispose();
    env.cleanup();
    await bridge.close();
    await sim.close();
  }
});
