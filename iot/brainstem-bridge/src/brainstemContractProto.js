import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

export const DEFAULT_CONTRACTS_ROOT = path.resolve(import.meta.dirname, '../../../contracts');
export const PRINCIPAL_PATTERN = /^[a-z][a-z0-9-]{0,63}@[a-z][a-z0-9-]{0,63}$/;
export const MAX_LINEAR_MPS = 3.0;
export const MAX_YAW_RPS = 3.0;
export const MAX_MESSAGE_BYTES = 64 * 1024;

export const CMS_STATE_KIND_NAMES = Object.freeze(['zero', 'grounded', 'standing', 'walking', 'transitioning']);
export const CMS_TRANSITION_KIND_NAMES = Object.freeze(['none', 'stand_up', 'sit_down', 'gesture']);
export const CONTROL_OWNER_NAMES = Object.freeze(['none', 'grpc', 'yunzhuo']);
export const RECOVERY_PHASE_NAMES = Object.freeze([
  'unspecified', 'absent', 'selected', 'enabled', 'getting-up', 'stable-stand', 'exiting',
]);
export const RECOVERY_REASON_NAMES = Object.freeze([
  'none', 'unavailable', 'model-not-configured', 'enable-sequence-unverified', 'walking',
  'not-selected', 'not-stable', 'heartbeat-expired', 'precondition',
]);

/** Load RobotControl and RobotRecovery gRPC service definitions from cms.proto and recovery.proto. */
export async function loadBrainstemContractServices(protoRoot = DEFAULT_CONTRACTS_ROOT) {
  const resolvedRoot = path.resolve(protoRoot);
  const cmsPath = path.join(resolvedRoot, 'brainstem_api', 'cms.proto');
  const commonPath = path.join(resolvedRoot, 'brainstem_api', 'common.proto');
  const recoveryPath = path.join(resolvedRoot, 'brainstem_api', 'recovery.proto');
  await Promise.all([
    access(cmsPath, constants.R_OK),
    access(commonPath, constants.R_OK),
    access(recoveryPath, constants.R_OK),
  ]);
  const definition = await protoLoader.load([cmsPath, recoveryPath], {
    includeDirs: [resolvedRoot],
    keepCase: false,
    longs: String,
    enums: Number,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition);
  const v1 = loaded?.brainstem?.api?.v1;
  if (typeof v1?.RobotControl !== 'function' || typeof v1?.RobotRecovery !== 'function') {
    throw new Error('RobotControl or RobotRecovery service was not found in brainstem_api protos');
  }
  return Object.freeze({
    protoRoot: resolvedRoot,
    RobotControl: v1.RobotControl,
    RobotRecovery: v1.RobotRecovery,
  });
}

/** Validate a LAN-dev IPv4 target matching ControlSession / BrainstemGrpcModule rules. */
export function validateLanEndpoint(host, port) {
  if (typeof host !== 'string' || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  const normalized = host.trim().toLowerCase();
  if (!/^[0-9.]+$/.test(normalized)) return null;
  const parts = normalized.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9][0-9]{0,2})$/.test(part) || Number(part) > 255)) {
    return null;
  }
  const nums = parts.map(Number);
  const allowed = normalized === '127.0.0.1'
    || nums[0] === 10
    || (nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31)
    || (nums[0] === 192 && nums[1] === 168);
  return allowed ? { host: normalized, port } : null;
}

/** Bounded gRPC server shutdown with force fallback matching local-protocol-fixture. */
export function shutdownGrpcServer(server, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      try { server.forceShutdown(); } catch { /* Best effort force shutdown. */ }
      finish();
    }, timeoutMs);
    try {
      server.tryShutdown(() => finish());
    } catch {
      try { server.forceShutdown(); } catch { /* Best effort force shutdown. */ }
      finish();
    }
  });
}
